# Project Management System

This React/Vite application provides a multi‑role project and task management interface with Firebase authentication and Firestore data storage.

## Local Setup

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configuration**
   The Firebase settings live directly in `src/firebase.js`. No additional environment files are required; you can edit the object there if you need to point to a different project.
3. **Run development server**
   ```bash
   npm run dev
   ```

## Deployment on Vercel

1. Push your repository to GitHub (or another git provider). Vercel can import directly from Git.
2. In the Vercel dashboard, click "New Project" ➜ select the repo.
3. Configure the project if necessary:
   - **Framework**: Vite (auto-detected)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Deploy – Vercel will build and publish your app, and each future push will trigger an automatic redeploy.

## Gitignore

There is no need for `.env.local` in this setup; the existing `.gitignore` already excludes common local files.

## Notes

- The Firebase config is public by design; keeping it in source works fine for client apps.
- If you ever migrate to multiple environments you can still switch to env vars later.

Happy coding!  🎉



Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
