# Backend

This folder contains the Express backend for the Iffy Collections application.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file if needed, or copy from `.env.example`.

3. Start the server:
   ```bash
   npm start
   ```

## Project structure

- `src/index.js` - main server entry point
- `src/routes/` - route definitions
- `src/controllers/` - request handlers
- `src/middleware/` - middleware functions
- `src/utils/` - utility helpers
- `uploads/` - stored user avatars and product images

## Notes

- Ensure the database is configured correctly in `.env`.
- Use the `init-admin.js` utility if you need to seed an admin user.
