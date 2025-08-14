# GEMINI.md

## Project Overview

This project is a web-based tool for generating children's books. It consists of a Progressive Web App (PWA) frontend and a Node.js backend. The tool allows users to define characters, provide a story outline, and then automatically generate a complete, illustrated children's book in PDF format.

The generation process is a one-button pipeline that:
1.  Analyzes user-provided character descriptions and images.
2.  Generates a detailed story plan in JSON format.
3.  Creates illustrations for the cover and each page of the book.
4.  Assembles the generated images into a PDF file.
5.  Provides a download link for the finished book.

The application leverages several AI models from OpenAI:
*   **Character Analysis:** `gpt-4o-mini` is used to analyze character descriptions and images, extracting key features to ensure visual consistency throughout the book.
*   **Story Planning:** `gpt-4.1-mini` takes the character analyses and a story outline to create a detailed, page-by-page plan for the book.
*   **Image Generation:** `gpt-image-1` generates the illustrations for the book based on the story plan.

The backend is built with Node.js and Express, and it handles all the communication with the OpenAI API. The frontend is a simple, single-page application built with vanilla JavaScript that allows users to input the necessary information and initiate the book generation process.

## Building and Running

To build and run the project, follow these steps:

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Configure Environment Variables:**
    Copy the `.env.example` file to a new file named `.env`:
    ```bash
    cp .env.example .env
    ```
    Then, open the `.env` file and add your OpenAI API key:
    ```
    OPENAI_API_KEY=your-openai-api-key
    ```

3.  **Start the Server:**
    ```bash
    npm start
    ```

4.  **Access the Application:**
    Open your web browser and navigate to `http://localhost:8080`.

## Development Conventions

*   **Backend:** The backend code is written in ES modules syntax (`import`/`export`). It uses `express` to create the web server and `node-fetch` to make requests to the OpenAI API. The code is well-structured and includes error handling and logging.
*   **Frontend:** The frontend code is written in vanilla JavaScript. It uses a single `app.js` file to handle all the client-side logic. The code is organized into functions that handle specific tasks, such as adding character cards, gathering user input, and making API requests.
*   **API:** The application uses a simple RESTful API with two main endpoints:
    *   `POST /api/generate-story-idea`: Generates a story idea from scratch.
    *   `POST /api/generate`: Generates a complete book based on user input.
*   **Styling:** The UI is styled with a simple CSS file (`style.css`). The layout is responsive and uses a card-based design.
*   **PWA:** The application is a Progressive Web App, which means it can be installed on the user's device and can work offline. It includes a `manifest.webmanifest` file and a `service-worker.js` file to enable PWA functionality.
