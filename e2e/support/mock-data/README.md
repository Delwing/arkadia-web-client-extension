# Mock Data Files

This directory contains mock data used by e2e tests.

## Files

- **map-data.json**: Mock map structure with two areas (Miasteczko Poslan and Zapomniane Jaskinie). Includes bank rooms for deposit tests.
- **map-colors.json**: Color definitions for different environment types on the map.
- **npc-data.json**: List of NPCs with their names and location IDs.
- **people-database.txt**: Base64-encoded SQLite database containing people data with guild information.
- **knowledge-data.json**: Book and library data for the knowledge system.

## Usage

These files are loaded by `e2e/support/mocks.ts` and used to mock API responses during e2e tests.
