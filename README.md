# Quantum Dungeon 

**Quantum Dungeon** is an interactive, game-based visualization of **quantum error correction using planar surface codes**.  
Players act as a *decoder*, identifying and correcting errors while minimizing energy and time, and avoiding logical failures caused by poor correction strategies.

The project is designed as an **educational tool**: it makes abstract concepts from quantum error correction tangible through gameplay.

---

##  Core Idea

In surface codes, physical errors on qubits are not observed directly.  
Instead, **stabilizer measurements** reveal *syndrome defects* (also called *anyons*), which must be paired and corrected carefully.

This game maps those ideas directly:

| Game Element | Quantum Meaning |
|-------------|----------------|
| Glowing dots | Syndrome defects (stabilizer violations) |
| Blue lines  | Physical X-errors on data qubits |
| Player paths | Decoder correction operators |
| Game over   | Logical operator formed |

Removing all visible defects does **not** mean all physical errors are gone — it only means the syndrome is clean.  
This distinction is a key learning objective of the game.

---

##  Gameplay Overview

### Objective
- **Remove all defects** (glowing dots)
- Use **as little energy and time as possible**
- Avoid creating boundary-spanning correction paths

### Controls
- **Click** a defect to select it
- **Click a second defect** to apply a correction path
- **Scan** suggests a nearby defect pair
- **End Turn** advances time and may introduce new noise
- **Restart** starts a fresh run

---

##  Winning and Losing

###  Win Condition
- All defects are removed
- The game ends successfully
- Your final score is recorded

###  Lose Condition (Logical Failure)
- If a **correction path connects the top boundary to the bottom boundary**
- This represents a **logical operator** acting on the encoded qubit
- The game ends immediately

This models a key idea in quantum error correction:
> Logical errors often arise not from noise alone, but from *poor decoding choices*.

---

##  Scoring System

The score measures **decoder efficiency**.

- Score increases with:
  - Energy used (long correction paths)
  - Time taken
- **Lower score = better decoding**
- Best score is stored locally in the browser

This encourages careful, local corrections instead of long, risky paths.

---

##  Noise Model

- Errors are injected only on **interior edges** of a planar lattice
- Each noise event creates **pairs of defects**
- Noise is applied every second turn (beginner-friendly regime)

This places the game in a **below-threshold regime**, where successful decoding is expected — consistent with surface-code theory.

---

##  Educational Goals

This project aims to:
- Build intuition for **surface-code decoding**
- Demonstrate how logical errors emerge from decoding paths
- Show the difference between *physical errors* and *syndrome information*
- Encourage energy-efficient correction strategies

---

##  Running the game Locally

### Requirements
- **Node.js** (v18 or newer recommended)
- npm (comes with Node.js)

### Installation
```bash
brew install node npm (on mac)
```
```
sudo apt update(linux)
sudo apt install -y nodejs npm (linux)
```
check for both 
```
node -v
npm -v
```

Clone the repository:
```bash
git clone https://github.com/sohamroy20/Quantum-Dungeon.git
cd Quantum-Dungeon
cd quantum-dungeon
npm install
npm run dev
```
Then open the link at localhost. Typically http://localhost:5173
<img width="1507" height="777" alt="image" src="https://github.com/user-attachments/assets/e10af6d2-fc12-471c-ae7a-a3c090e2ccab" />


<img width="1507" height="750" alt="Pasted Graphic 1" src="https://github.com/user-attachments/assets/f8ae5086-5731-4b4f-a3e0-ee24ad57aa77" />



