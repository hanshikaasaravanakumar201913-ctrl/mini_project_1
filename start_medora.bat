@echo off
echo ==================================================
echo   Starting Medora Full-Stack Development Server
echo ==================================================

set PYTHON_CMD=python
if exist "backend\.venv\Scripts\python.exe" (
    set PYTHON_CMD=backend\.venv\Scripts\python.exe
)

echo.
echo [1/3] Checking database and seeding demonstration records if needed...
"%PYTHON_CMD%" seed_db.py

echo.
echo [2/3] Launching FastAPI Backend on http://127.0.0.1:8000 ...
start "Medora Backend (FastAPI)" cmd /k "%PYTHON_CMD% run_backend.py"

echo.
echo [3/3] Launching React Vite Frontend on http://localhost:5173 ...
cd frontend
if exist "C:\Users\Adox\tools\node-v26.13.0-win-x64\node.exe" (
    set "PATH=C:\Users\Adox\tools\node-v26.13.0-win-x64;%PATH%"
)
start "Medora Frontend (Vite)" cmd /k "npm run dev"

echo.
echo ==================================================
echo  Both servers started!
echo  Frontend URL: http://localhost:5173
echo  Backend Docs: http://127.0.0.1:8000/docs
echo ==================================================
