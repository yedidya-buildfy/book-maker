# Children’s Book Generator (PWA + Node) - Project Context

## Project Overview

This project is a full-stack application that generates children's books using AI. It consists of a Node.js/Express backend server and a client-side Progressive Web App (PWA) frontend. The user provides character images and basic story details. The system then performs the following steps:

1.  **Character Analysis:** Uses OpenAI's GPT-4o (vision model) to analyze uploaded character images and generate textual descriptions for consistency.
2.  **Book Planning:** Employs GPT-3.5-turbo to create a detailed JSON plan for the book, including layouts for the front cover, back cover, and a specified number of story pages. This plan incorporates the character analyses.
3.  **Image Generation:** Leverages DALL-E 3 via the OpenAI API to generate images for each page and cover based on the detailed descriptions from the plan.
4.  **PDF Assembly:** Combines the generated images into a downloadable PDF book.

The frontend PWA allows users to input story details, upload character images, trigger the generation process, and download the final PDF. The application is designed to be installable on devices supporting PWAs.

## Technology Stack

*   **Backend:** Node.js with ES Modules (`type: "module"`), Express.js.
*   **Frontend:** Vanilla JavaScript PWA.
*   **Key Libraries (Backend):**
    *   `dotenv`: For loading environment variables.
    *   `pdfkit`: For creating PDF documents.
    *   `jimp`: For image processing (specifically creating a character board summary).
*   **AI Services:** OpenAI API (GPT-4o, GPT-3.5-turbo, DALL-E 3).
*   **Styling:** Plain CSS with responsive design and dark mode support.

## Building and Running

### Prerequisites

*   Node.js and npm installed.
*   An OpenAI API key.

### Setup and Execution

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Configure Environment:**
    ```bash
    cp .env.example .env
    ```
    Edit the `.env` file to add your `OPENAI_API_KEY`.
3.  **Start the Server:**
    ```bash
    npm start
    ```
    This command runs `node server.js`. The server will start on `http://localhost:8080` by default (port can be configured via the `PORT` environment variable).

### Key Endpoints

*   `GET /`: Serves the PWA frontend.
*   `GET /output/*`: Serves generated PDFs and images.
*   `POST /api/generate-story-idea`: Generates a story title, outline, and suggested page count.
*   `POST /api/generate`: The main endpoint that triggers the full book generation pipeline.

## Development Conventions

*   **Server:** The main server logic resides in `server.js`. It uses ES modules (`import`/`export`). Logging is handled by a custom `log` function for better visibility, with specific "PHASE START" and "PHASE END" markers for major operations.
*   **Client:** The PWA frontend is located in the `client/` directory.
    *   `index.html`: Main HTML structure.
    *   `app.js`: Client-side JavaScript logic for UI interaction, API calls, and PWA features.
    *   `style.css`: Styling for the application.
    *   `service-worker.js`: Implements caching strategies for the PWA.
    *   `manifest.webmanifest`: PWA manifest file defining name, icons, theme, etc.
*   **Environment Variables:** API keys and configuration are managed via a `.env` file, loaded using the `dotenv` package.
*   **Output:** Generated books (PDFs and intermediate images) are stored in the `output/` directory, organized by run ID.
*   **Error Handling & Retries:** The server includes logic for retrying failed OpenAI API calls, particularly for rate limits, using exponential backoff. JSON parsing for LLM responses has been made more robust with fallback extraction methods.