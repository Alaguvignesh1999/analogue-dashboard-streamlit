# Streamlit Migration Notes

This copied project is the Python-native Streamlit version of the analogue dashboard.

Rules this copy follows:

- The original Next.js project is left untouched.
- Streamlit logic lives in `app.py`, `views/`, `engine/`, `data_access/`, `state/`, and Python modules under `config/`.
- Historical artifacts remain file-based under `public/data/`.
- Custom events are session-local only.
- Shared/private/demo live modes are handled inside Streamlit session state.

Run locally:

```bash
pip install -r requirements.txt
streamlit run app.py
```

Test locally:

```bash
pytest -q
```

Key modules:

- `data_access/artifacts.py`: artifact loading + normalization
- `state/session.py`: Streamlit session-state contract
- `engine/`: data/math ports from the original TypeScript app
- `views/`: tab renderers grouped by dashboard section
