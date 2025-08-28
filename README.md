# 🤖 CodeGuadian – AI Code Review Bot

![GitHub release](https://img.shields.io/github/v/release/x86nick/codesage?color=blue)
![GitHub Actions](https://img.shields.io/github/actions/workflow/status/x86nick/codesage/ci.yml?label=build)
![License](https://img.shields.io/github/license/x86nick/codesage?color=green)
![Issues](https://img.shields.io/github/issues/x86nick/codesage)

**CodeSage** is an AI-powered GitHub Action that automates pull request reviews, generates release notes, and improves collaboration by leaving professional, consistent feedback directly in your repository.

---

## ✨ Features

- 🔍 **Automated Pull Request Reviews** – Get instant AI-powered insights for every PR.  
- 💬 **Inline Comments** – Suggestions appear directly on changed lines of code.  
- 🤝 **Smart Conversations** – Replies to existing comments and continues discussions contextually.  
- 📝 **Release Notes Generation** – Automatically updates PR descriptions with structured release notes.  
- ⚡ **Flexible Comment Modes** – Supports `create`, `replace`, `append`, and `prepend`.  
- 🛡️ **Seamless Integration** – Works out of the box with GitHub Actions.

---

## 🚀 Getting Started

### 1. Add to your workflow
Create (or edit) `.github/workflows/review.yml`:

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: AI Code Review
        uses: x86nick/codesage@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
📖 How It Works

Triggered when a pull request is opened or updated.

Analyzes the code diff and context.

Posts AI-generated comments and suggestions inline.

Updates or appends to existing PR comments if configured.

Inserts release notes into PR descriptions.
🛠 Development

Clone the repository:

git clone https://github.com/x86nick/codesage.git
cd codesage
npm install
npm run build


Run tests:

npm test

🤝 Contributing

Contributions are welcome! Please open an issue or PR with improvements, bug fixes, or feature requests.
Make sure to follow the project’s coding standards and include tests where applicable.


