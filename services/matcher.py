"""
Job description parsing and resume matching service.
"""

import json
import os
from groq import Groq
from dotenv import load_dotenv

from models import JobD, Resume, MatchResult

load_dotenv()

MODEL = "llama-3.3-70b-versatile"

def get_client():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("API key kaha hai bhai (or set in Settings)")
    return Groq(api_key=api_key)

def parse_job_description(jd_text: str) -> JobD:
    """Parse a job description text into a structured JobD object."""
    
    client = get_client()
    jobd_schema = JobD.model_json_schema()

    system_prompt = f"""
You are an expert HR assistant.

Your job is to analyze job descriptions and extract
structured information from them.

Return ONLY valid JSON matching this schema:

{jobd_schema}

IMPORTANT:
Do NOT return the schema itself.
Do NOT return fields like "properties", "title" or "type".
Fill the schema with actual information extracted from the job description.

If minimum experience is not mentioned, return null.
If information for a list is missing, return an empty list.
Do not invent information.
"""

    user_prompt = f"""
Analyze the following job description:

{jd_text}
"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        response_format={"type": "json_object"},
    )

    raw_json = response.choices[0].message.content
    data = json.loads(raw_json)
    return JobD(**data)


def match_resume(job: JobD, resume: Resume) -> MatchResult:
    """Compare a parsed resume against a job description and return match score + details."""
    
    client = get_client()
    match_schema = MatchResult.model_json_schema()

    prompt = f"""
You are an expert technical HR recruiter and AI.

Compare the candidate's resume with the job description using a rigorous, systematic rubric.
CRITICAL INSTRUCTION: Evaluate based on SEMANTIC MEANING and ACTUAL EXPERIENCE, not just exact keyword matching.
- Identify equivalent tools and transferable skills (e.g., if JD asks for "Machine Learning" and resume has "Scikit-learn" or "Predictive Modeling", that is a match).
- If JD asks for "Cloud Infrastructure" and resume has "AWS EC2" or "GCP", that is a match.
- Value practical experience and project context over just listing a keyword.

Systematic Rubric:
1. "skills_score" (0-100): Percentage of required skills/competencies met through semantic matching.
2. "experience_score" (0-100): 100 if the minimum experience is fully met or exceeded, scaled down proportionally if partially met.
3. "score" (0-100): Weighted average of skills_score (60%) and experience_score (40%).
4. "justification": A 1-2 sentence explanation of why this score was given, highlighting strengths or critical gaps.

JOB DESCRIPTION:
{job.model_dump_json(indent=2)}

CANDIDATE RESUME:
{resume.model_dump_json(indent=2)}

Return JSON matching this schema:

{match_schema}

The "details" field must be a JSON object with exactly these keys:
- "candidate_name": string (the candidate's name)
- "matching_skills": list of strings (skills/competencies the candidate has that semantically match the JD)
- "missing_skills": list of strings (important JD skills/competencies the candidate is genuinely missing)
- "experience_met": string ("Yes", "No", or "Partially")
- "verdict": string (one of: "Strong Match", "Good Match", "Potential Match", "Weak Match", "Poor Match")

Keep the response concise.
"""

    messages = [{"role": "user", "content": prompt}]

    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        response_format={"type": "json_object"},
    )

    data = json.loads(response.choices[0].message.content)
    return MatchResult(**data)
