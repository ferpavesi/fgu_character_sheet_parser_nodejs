# FGU Character Sheet Generator - V3 (Node.js)

Node.js/Express version of the Fantasy Grounds Unity character sheet generator.

## Features

- 🎯 Convert FGU XML character files to beautiful HTML character sheets
- 📱 Fully responsive design (desktop, tablet, mobile)
- 🌐 Web-based interface with drag-and-drop upload
- 📥 Download generated HTML files
- ✨ Interactive spell sections with expand/collapse
- 🔢 Sorcery Points and Spell Slots as checkboxes
- 💰 Editable wealth and HP tracking

## Requirements

- Node.js >= 18.0.0
- npm or yarn

## Installation

```bash
npm install
```

## Running Locally

### Development (with auto-reload)
```bash
npm run dev
```

### Production
```bash
npm start
```

The server will start on `http://localhost:3000`

## Usage

1. Open `http://localhost:3000` in your browser
2. Export your character from Fantasy Grounds Unity as XML
3. Upload the XML file using the web interface
4. View the generated character sheet in your browser
5. Download the HTML file if needed

## Deployment to Vercel

### Option 1: Vercel CLI

```bash
npm install -g vercel
vercel
```

### Option 2: GitHub Integration

1. Push this folder to a GitHub repository
2. Connect the repository to Vercel
3. Deploy automatically

### Configuration

The `vercel.json` file is already configured for Node.js deployment.

## Project Structure

```
V3_NodeJS/
├── server.js           # Express server and main logic
├── package.json        # NPM dependencies and scripts
├── vercel.json        # Vercel deployment config
├── .gitignore         # Git ignore rules
├── public/
│   └── index.html     # Frontend upload interface
└── README.md          # This file
```

## Dependencies

- **express**: ^4.18.2 - Web framework
- **multer**: ^1.4.5-lts.1 - File upload handling
- **xml2js**: ^0.6.2 - XML parsing

## API Endpoints

### `GET /`
Serves the upload interface

### `POST /generate`
- Accepts XML file upload (max 16MB)
- Returns JSON: `{ html: "...", filename: "CharName.html", success: true }`
- Error response: `{ error: "...", success: false }`

### `GET /health`
Health check endpoint
- Returns: `{ status: "ok" }`

## Differences from V2 (Python/Flask)

- **Language**: Node.js/JavaScript instead of Python
- **Framework**: Express.js instead of Flask
- **File Upload**: Multer instead of Werkzeug
- **XML Parsing**: xml2js instead of Python's xml.etree
- **Deployment**: Same Vercel platform, different runtime

## Features Parity with V2

✅ All V2 features implemented:
- In-browser character sheet display
- Download button for HTML file
- Spell toggles (expand/collapse all)
- Sorcery Points as checkboxes
- Responsive design (900px, 600px breakpoints)
- Wealth box editable inputs
- Character name-based filenames

## License

Open source - free to use and modify

## Credits

Created for Fantasy Grounds Unity character management
