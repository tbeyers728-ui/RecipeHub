# RecipeHub API

REST API backend for the RecipeHub iOS app. Built with Node.js, Express, and PostgreSQL.

## Setup

```bash
npm install
cp .env.example .env   # fill in your DATABASE_URL and JWT_SECRET
npm run db:migrate
npm run dev
```

## Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Current user profile |

### Recipes
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/recipes` | List own + public recipes (supports `?search=`, `?cuisine=`, `?tags=`, `?page=`, `?limit=`) |
| GET | `/api/recipes/:id` | Get recipe with ingredients & steps |
| POST | `/api/recipes` | Create recipe |
| PUT | `/api/recipes/:id` | Update recipe |
| DELETE | `/api/recipes/:id` | Delete recipe |
| POST | `/api/recipes/:id/save` | Save a public recipe |
| DELETE | `/api/recipes/:id/save` | Unsave a recipe |

### Meal Plan
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/meal-plan` | Get meal plan (`?start=YYYY-MM-DD&end=YYYY-MM-DD`) |
| POST | `/api/meal-plan` | Add entry |
| PUT | `/api/meal-plan/:id` | Update entry |
| DELETE | `/api/meal-plan/:id` | Remove entry |
| POST | `/api/meal-plan/generate-shopping-list` | Generate shopping list from date range |

### Shopping List
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/shopping-list` | Get all items |
| POST | `/api/shopping-list` | Add item |
| PATCH | `/api/shopping-list/:id` | Update item (check/uncheck, edit) |
| DELETE | `/api/shopping-list/:id` | Remove item |
| DELETE | `/api/shopping-list/checked` | Clear all checked items |

### Pantry Tracker
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/pantry` | List all pantry items |
| POST | `/api/pantry` | Add / update item (upsert by name) |
| POST | `/api/pantry/bulk` | Bulk upsert (e.g. after shopping) |
| PATCH | `/api/pantry/:id` | Update quantity / expiry |
| DELETE | `/api/pantry/:id` | Remove item |
| GET | `/api/pantry/can-cook` | Match pantry against recipes (`?min_match_pct=70`) |

### Cooking Timers
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/timers/session` | Start a cooking session for a recipe |
| GET | `/api/timers/session/:session_id` | List timers in a session |
| GET | `/api/timers/recipe/:recipe_id/suggested` | Auto-parse timers from step instructions |
| POST | `/api/timers` | Create a timer in a session |
| PATCH | `/api/timers/:id/pause` | Pause a running timer |
| PATCH | `/api/timers/:id/resume` | Resume a paused timer |
| PATCH | `/api/timers/:id/stop` | Mark timer completed or cancelled |

## Authentication

All endpoints except `/api/auth/register` and `/api/auth/login` require:
```
Authorization: Bearer <token>
```
