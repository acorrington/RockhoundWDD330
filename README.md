# 💎 Rockhound Companion

Welcome to **Rockhound Companion**, a modern, lightweight, and fully responsive web application designed for rockhounds, amateur geologists, and mineral collectors. 

This application empowers you to log and catalog your specimen library, identify mystery field finds using a step-by-step diagnostic questionnaire, and map out future mineral excursions with persistent packing checklists.

---

## ✨ Features

1. **🎒 Digital Specimen Case (Finds Log)**
   - Log specimen name, find location/GPS, discovery date, Mohs hardness, body color, and extensive geological observations.
   - Live searching and category tab filtering (Rocks, Minerals, Fossils).
   - Edit, update, and delete recorded logs with auto-populated form values.
   - LocalStorage persistence to keep your collection secure offline.

2. **🔍 Interactive Mineral Identification Helper**
   - Step-by-step diagnostic quiz assessing Luster, Mohs Hardness, Streak plate, and Body Color.
   - Intelligent matching engine that checks user criteria against a robust internal geological database of common minerals (Quartz, Calcite, Pyrite, Fluorite, Galena, Hematite, and more).
   - Generates compatibility scores and geological fun facts.

3. **🗺️ Field Trip / Excursion Planner**
   - Schedule future mineral digs with targeted locations, date, and targeted minerals list.
   - Interactive checklist for safety equipment, rock picks, chisels, acid bottles, and hand lenses.
   - Check off items, cancel plans, or mark excursions completed with instant storage saving.

4. **🎨 Crystalline/Mineral Themed UI**
   - Dark mode glassmorphic UI utilizing deep volcanic obsidian, crystalline amethyst, quartz pink, and fluorescent geode teal accents.
   - Custom-crafted layout, grid structures, and seamless view-swapping transitions.

---

## 🛠️ Technology Stack

- **HTML5 & Modern CSS3** — Flexbox, responsive grid design, fluid typography, animations, and custom CSS custom variables.
- **Vanilla ES6+ JavaScript** — Strict modular standard, DOM events, state management, and algorithmic matching structures.
- **LocalStorage API** — Automatic state backups for both the Specimen Catalog and Trip lists.
- **Vite** — Fast, next-generation build tool and local development server.

---

## 🚀 Getting Started

### Prerequisites

You need [Node.js](https://nodejs.org/) installed on your computer.

### Installation

1. Clone or download the repository to your local workspace.
2. In the project root, install Vite and any other dev dependencies:
   ```bash
   npm install
   ```

### Running the Local Development Server

Start Vite's ultra-fast dev server to view the application locally with Hot Module Replacement (HMR):
```bash
npm run dev
```
Once started, open [http://localhost:3000](http://localhost:3000) in your favorite browser.

### Building for Production

Compile, bundle, and optimize the application into static HTML, CSS, and JS assets inside the `/dist` directory:
```bash
npm run build
```

### Previewing the Production Build

Test your compiled production build locally to ensure everything works perfectly before deploying:
```bash
npm run preview
```

---

## 🐙 Git & GitHub Integration

This project is fully ready to be published and tracked with Git and GitHub.

### 1. Initialize Git Locally
If your folder isn't initialized with Git yet, run:
```bash
git init
```

### 2. Add files and Commit
Stage all project files:
```bash
git add .
```
Commit them with a structured commit message:
```bash
git commit -m "feat: initial scaffold of Rockhound Companion with catalog, identifier, and trip planner modules"
```

### 3. Connect to GitHub
1. Create a new repository on your GitHub account (named `RockhoundCompanion`).
2. Link your local repository to your remote GitHub repository (replace `<username>` with your actual GitHub username):
   ```bash
   git remote add origin https://github.com/<username>/RockhoundCompanion.git
   ```
3. Set your main branch name to `main`:
   ```bash
   git branch -M main
   ```
4. Push your codebase to the remote repository:
   ```bash
   git push -u origin main
   ```

---

*Happy Rockhunting! May your geode pockets be deep and your crystals well-formed.* ⛏️💎⛰️
