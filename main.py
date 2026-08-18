"""
Synapse.AI — FastAPI application for AI-powered resume screening.

Run with: uvicorn main:app --reload
"""

import asyncio
import json
import os
import shutil
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from models import CandidateResult
from services.file_reader import read_resume_file
from services.parser import parse_resume
from services.matcher import parse_job_description, match_resume

load_dotenv()

# --- App Setup ---

app = FastAPI(title="Synapse.AI", description="AI-Powered Resume Screening")

# Create uploads directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Serve static files (frontend)
STATIC_DIR = Path("static")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# --- Routes ---


@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    """Serve the main frontend page."""
    index_path = STATIC_DIR / "index.html"
    return HTMLResponse(content=index_path.read_text(encoding="utf-8"))


@app.post("/api/parse-stream")
async def parse_stream(
    job_description: str = Form(...),
    files: list[UploadFile] = File(...),
    api_key: str = Form(""),
    strictness: str = Form("standard")
):
    """
    Process multiple resumes against a job description with SSE streaming.

    Streams progress updates and results in real-time.
    """

    async def event_generator():
        # Apply the API key globally for this request
        if api_key:
            os.environ["GROQ_API_KEY"] = api_key
            
        # Create a unique session folder for this batch
        session_id = str(uuid.uuid4())[:8]
        session_dir = UPLOAD_DIR / session_id
        session_dir.mkdir(exist_ok=True)

        saved_files: list[Path] = []
        all_results: list[dict] = []

        try:
            # Save uploaded files to disk
            for upload_file in files:
                file_path = session_dir / upload_file.filename
                with open(file_path, "wb") as f:
                    content = await upload_file.read()
                    f.write(content)
                saved_files.append(file_path)

            total = len(saved_files)

            # Step 1: Parse job description
            yield _sse_event({"status": "parsing_jd"})
            await asyncio.sleep(0)  # yield control

            job = await asyncio.to_thread(parse_job_description, job_description)

            # Step 2: Process each resume
            for idx, file_path in enumerate(saved_files, start=1):
                file_name = file_path.name

                yield _sse_event({
                    "status": "processing",
                    "current": idx,
                    "total": total,
                    "file_name": file_name,
                })
                await asyncio.sleep(0)

                try:
                    # Extract text
                    resume_text = await asyncio.to_thread(read_resume_file, file_path)
                    if not resume_text:
                        yield _sse_event({
                            "status": "error",
                            "message": f"Could not read {file_name} — unsupported format.",
                        })
                        continue

                    # Parse resume (LLM call 1)
                    parsed_resume = await asyncio.to_thread(parse_resume, resume_text)

                    # Rate limit delay
                    await asyncio.sleep(2)

                    # Match against JD (LLM call 2)
                    match_result = await asyncio.to_thread(match_resume, job, parsed_resume)

                    # Rate limit delay
                    await asyncio.sleep(2)

                    # Build candidate result
                    details = match_result.details
                    candidate = CandidateResult(
                        rank=0,  # will be set after sorting
                        name=details.get("candidate_name", parsed_resume.name),
                        email=parsed_resume.email,
                        phone=parsed_resume.phone,
                        score=match_result.score,
                        skills_score=match_result.skills_score,
                        experience_score=match_result.experience_score,
                        justification=match_result.justification,
                        matching_skills=details.get("matching_skills", []),
                        missing_skills=details.get("missing_skills", []),
                        experience_met=details.get("experience_met", "Unknown"),
                        verdict=details.get("verdict", "N/A"),
                        file_name=file_name,
                    )

                    all_results.append(candidate.model_dump())

                    yield _sse_event({
                        "status": "result",
                        "current": idx,
                        "total": total,
                        "candidate": candidate.model_dump(),
                    })

                except Exception as e:
                    yield _sse_event({
                        "status": "error",
                        "message": f"Error processing {file_name}: {str(e)}",
                    })

            # Step 3: Sort and assign ranks
            all_results.sort(key=lambda c: c["score"], reverse=True)
            for rank, candidate in enumerate(all_results, start=1):
                candidate["rank"] = rank

            yield _sse_event({
                "status": "complete",
                "results": all_results,
            })

        except Exception as e:
            yield _sse_event({
                "status": "error",
                "message": f"Fatal error: {str(e)}",
            })

        finally:
            # Cleanup uploaded files
            try:
                shutil.rmtree(session_dir)
            except Exception:
                pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _sse_event(data: dict) -> str:
    """Format a dict as an SSE event string."""
    return f"data: {json.dumps(data)}\n\n"


# --- Entry Point ---

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
