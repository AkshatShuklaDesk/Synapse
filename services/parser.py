"""
Resume parsing service — uses Groq LLM to extract structured data from resume text.
"""

import json
import os
from groq import Groq
from dotenv import load_dotenv

from models import Resume

load_dotenv()

MODEL = "llama-3.3-70b-versatile"

def get_client():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("API key kaha hai bhai (or set in Settings)")
    return Groq(api_key=api_key)

def parse_resume(resume_text: str) -> Resume:
    """Parse raw resume text into a structured Resume object using LLM."""

    client = get_client()
    resume_schema = Resume.model_json_schema()

    system_prompt = f"""
You are an expert resume parser.

Extract information from the resume based on its meaning,
not only based on exact section headings.

Different resumes may use different headings.

For example:
- Experience
- Professional Experience
- Work History
- Employment
- Internships

These may all contain relevant experience.

Skills may also appear in the skills section, work experience,
internships or projects.

Return ONLY valid JSON matching this schema:

{resume_schema}

Important rules:

1. Do not invent information.
2. If a value is not available, return null.
3. If a list has no information, return an empty list.
4. Include internships inside experiences.
5. Extract skills mentioned across the entire resume.
"""

    user_prompt = f"""
Parse the following resume:

{resume_text}
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

    raw_output = response.choices[0].message.content
    data = json.loads(raw_output)
    return Resume(**data)
