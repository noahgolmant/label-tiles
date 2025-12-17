.PHONY: help setup install install-titiler dev backend frontend clean

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

setup: install ## Alias for install

install: ## Install all dependencies (backend and frontend)
	@echo "Installing backend dependencies..."
	cd backend && uv sync
	@echo "Installing frontend dependencies..."
	cd frontend && pnpm install
	@echo "Setup complete!"

install-titiler: ## Install TiTiler for drag-and-drop GeoTIFF support
	@echo "Installing TiTiler dependencies..."
	cd backend && uv pip install -e ".[titiler]"
	@echo "TiTiler setup complete! Restart the backend to enable GeoTIFF support."

dev: ## Start both backend and frontend in development mode
	@echo "Starting backend and frontend..."
	@make -j2 backend frontend

backend: ## Start backend server only
	@echo "Starting backend server on http://localhost:8000"
	cd backend && uv run uvicorn main:app --reload --port 8000

frontend: ## Start frontend dev server only
	@echo "Starting frontend dev server on http://localhost:5173"
	cd frontend && pnpm run dev

sliding-window: ## Generate sliding window training data (usage: make sliding-window STRIDE=256 [ID=tile-server-id])
	@if [ -z "$(STRIDE)" ]; then echo "Error: STRIDE is required (e.g., make sliding-window STRIDE=256)"; exit 1; fi
	cd backend && uv run sliding_window.py --stride $(STRIDE) $(if $(ID),--tile-server-id $(ID),)

clean: ## Clean build artifacts and dependencies
	@echo "Cleaning backend..."
	cd backend && rm -rf .venv __pycache__ .pytest_cache
	@echo "Cleaning frontend..."
	cd frontend && rm -rf node_modules dist
	@echo "Clean complete!"
