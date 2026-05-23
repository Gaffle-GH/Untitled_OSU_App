VENV = venv
PYTHON = $(VENV)/bin/python3
PIP = $(VENV)/bin/pip

.PHONY: run clean

run: $(VENV)/bin/activate
	$(PYTHON) test_cases.py

# Installs All Required Library
$(VENV)/bin/activate: requirements.txt
	python3 -m venv $(VENV)
	$(PIP) install -r requirements.txt

# Cleans (TESTS Folders [Download & Previews] & Clears PyCache)
clean:
	rm -r previews/*
	rm -r download/*
	rm -rf __pycache__/*
	rm -rf $(VENV)