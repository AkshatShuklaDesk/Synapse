# Synapse.ai

AI-powered resume screening and candidate matching platform built with **FastAPI**. Synapse analyzes candidate resumes against a Job Description (JD), generates matching results, and helps recruiters quickly identify suitable candidates.

## Features

* 📄 Upload Job Descriptions and candidate resumes
* 🤖 AI-powered resume-to-JD matching
* 📊 Candidate matching results
* 📥 Export results to CSV
* 🕒 Resume screening history
* ⚙️ Settings and user preferences
* 🔑 Groq API key configuration
* 🚀 FastAPI backend with REST APIs

## Tech Stack

* **Backend:** Python, FastAPI
* **AI/LLM:** Groq API
* **API Documentation:** Swagger UI / OpenAPI
* **Data Processing:** Python
* **Frontend:** HTML, CSS, JavaScript
* **Export:** CSV

## Project Structure

```text
Synapse.ai/
├── main.py
├── models.py
├── requirements.txt
├── services/
├── static/
├── .gitignore
└── README.md
```

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/Synapse.ai.git
cd Synapse.ai
```

### 2. Create a virtual environment

```bash
python -m venv .venv
```

### 3. Activate the virtual environment

**Windows:**

```bash
.venv\Scripts\activate
```

**Linux/macOS:**

```bash
source .venv/bin/activate
```

### 4. Install dependencies

```bash
pip install -r requirements.txt
```

## Environment Variables

Create a `.env` file and add your Groq API key:

```env
GROQ_API_KEY=your_groq_api_key
```

**Never commit your `.env` file or API keys to GitHub.**

## Run the Application

Start the FastAPI server using:

```bash
uvicorn main:app --reload
```

The application will be available at:

```text
http://127.0.0.1:8000
```

## API Documentation

FastAPI automatically provides interactive API documentation.

### Swagger UI

```text
http://127.0.0.1:8000/docs
```

### ReDoc

```text
http://127.0.0.1:8000/redoc
```

## Workflow

```text
Upload Job Description
        ↓
Upload Candidate Resumes
        ↓
AI Resume Analysis
        ↓
Match Candidates with JD
        ↓
View Matching Results
        ↓
Export Results as CSV
        ↓
Save Screening History
```

## Future Improvements

* Advanced candidate ranking
* Multiple LLM provider support
* Authentication and role-based access
* Database integration
* Resume analytics dashboard
* Batch resume processing
* Deployment with Docker

## License

This project is intended for learning, development, and demonstration purposes.
