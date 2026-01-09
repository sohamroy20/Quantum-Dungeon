
# Quantum Dungeon

An interactive game that visualizes **surface-code decoding** as a puzzle game.

Players act as a decoder, pairing detected defects (syndrome outcomes) while
minimizing energy and time. Incorrect decoding paths can form logical operators
and cause failure.

---

## 🧠 Concept

This game is inspired by **planar surface codes** in quantum error correction.

- **Defects (dots)** represent stabilizer violations (anyons)
- **Paths (lines)** represent correction operators
- A path connecting the **top and bottom boundaries** forms a logical operator
  → **game over**

---

## 🎮 How to Play

1. Click a defect to select it
2. Click a second defect to apply a correction
3. Energy cost depends on Manhattan distance
4. End Turn advances time and introduces new noise
5. Use **Scan** for pairing hints

---

## 🏆 Scoring

- Score increases with:
  - Energy used
  - Time taken
- **Lower score = better decoding**
- Best score is stored locally

---

## 🧪 Educational Goals

- Visualize quantum error correction intuitively
- Show how poor decoding leads to logical failure
- Encourage energy-efficient, minimal corrections

---

## 🚀 Run Locally

```bash
npm install
npm run dev
