# Team Rogue – Mining Compliance Monitoring System

This repository contains an end-to-end geospatial decision support system for monitoring open-cast mining activity and No-Go zone compliance using multi-sensor satellite data.

## Overview
- Adaptive Change Vector Analysis (CVA)
- Sentinel-1 and Sentinel-2 multi-temporal fusion
- Percentile-based thresholding (mine-agnostic)
- Temporal stabilization and cumulative excavation tracking
- Interactive dashboard for compliance auditing

## Repository Structure
- `pipeline.py` – Backend geospatial analytics engine (GEE)
- `main_pipeline.ipynb` – Development and experimentation notebook
- `app.py` – Dashboard data interface / launcher
- `frontend/` – Client-side visualization dashboard
- `example outputs/` – Sample serialized outputs (non-sensitive)

## Usage
1. Run backend pipeline to generate `output.json`
2. Load the output file into the dashboard via the frontend interface
3. Inspect excavation metrics and No-Go zone violations

## Team
Team Rogue