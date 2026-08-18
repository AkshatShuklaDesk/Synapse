"""
Synapse.AI — Pydantic models for resume parsing and job matching.
"""

from pydantic import BaseModel, Field


class JobD(BaseModel):
    """Structured representation of a job description."""
    role: str
    required_skills: list[str]
    preferred_skills: list[str]
    minimum_experience: float | None = None
    education_requirements: list[str] = []
    responsibilities: list[str] = []


class Experience(BaseModel):
    """A single work/internship experience entry."""
    company: str | None = None
    role: str | None = None
    duration: str | None = None
    description: str | None = None
    skills_used: list[str] = []


class Resume(BaseModel):
    """Parsed resume data."""
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    total_experience_years: float | None = None
    skills: list[str] = []
    experiences: list[Experience] = []
    education: list[str] = []
    projects: list[str] = []
    certifications: list[str] = []


class MatchResult(BaseModel):
    """Raw LLM match result."""
    score: float
    skills_score: float
    experience_score: float
    justification: str
    details: dict


class CandidateResult(BaseModel):
    """Final result row for a single candidate — used in API response and CSV export."""
    rank: int = 0
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    score: float = 0.0
    skills_score: float = 0.0
    experience_score: float = 0.0
    justification: str = ""
    matching_skills: list[str] = []
    missing_skills: list[str] = []
    experience_met: str = "Unknown"
    verdict: str = "N/A"
    file_name: str = ""
