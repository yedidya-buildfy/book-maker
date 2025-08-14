# Children’s Book Generator (PWA + Node)
One-button pipeline: **Analyze characters → Plan JSON → Generate images → Build PDF**, then returns a **download link**.
- Models (auto-chosen): 
  - Character analysis (image→text): `gpt-4o-mini`
  - Planning (JSON): `gpt-4.1-mini`
  - Image generation (JSON→image): `gpt-image-1` (1024×1024)
- Server stores API key in `.env` and calls OpenAI.
- UI is an installable PWA; generation requires internet.

## Run
```bash
npm install
cp .env.example .env
# put your key in .env
npm start
# open http://localhost:8080
```
