/**
 * OpenAPI 3.1 description of the AI Coach API, served at /api/coach/openapi.json.
 * Import that URL as a ChatGPT GPT Action (Authentication: API key, Bearer).
 */
const json = (schema: object, description = "OK") => ({ description, content: { "application/json": { schema } } });
// ChatGPT Actions rejects object schemas without a `properties` key, even open-ended ones.
const obj = { type: "object", properties: {}, additionalProperties: true };
const errorRef = { $ref: "#/components/schemas/Error" };
const errors = {
  "400": json(errorRef, "Validation error"),
  "401": json(errorRef, "Missing or invalid token"),
  "403": json(errorRef, "Token lacks the required scope"),
  "429": json(errorRef, "Rate limited"),
};
const dateParam = (name: string, description: string) => ({ name, in: "query", required: false, description, schema: { type: "string", format: "date" } });
const intQuery = (name: string, description: string) => ({ name, in: "query", required: false, description, schema: { type: "integer" } });

const exerciseTarget = {
  type: "object",
  required: ["exercise_id"],
  properties: {
    exercise_id: { type: "string", description: "Id from listExercises (e.g. bench_press). A name also works." },
    sets: { type: "integer", minimum: 1, maximum: 50 },
    reps_min: { type: "integer" },
    reps_max: { type: "integer" },
    reps: { type: "string", description: 'Alternative to reps_min/max: "8" or "6-8"' },
    target_weight: { type: "number", description: "kg. Bodyweight exercises: added load. Farmer's Carry: per hand." },
    target_rpe: { type: "number", minimum: 1, maximum: 10 },
    target_distance: { type: "number", description: "meters (e.g. 1000 for a 1 km rep, 50 for a sled push)" },
    target_time: { type: "string", description: 'seconds or "m:ss"' },
    pace: { type: "string", description: 'Running target pace range per km, e.g. "4:20-4:30"' },
    hr_zone: { type: "integer", minimum: 1, maximum: 5 },
    rest_seconds: { type: "integer", minimum: 0, maximum: 1800 },
    coach_note: { type: "string", maxLength: 500 },
  },
};

const planFields = {
  date: { type: "string", format: "date", description: "Defaults to today in the athlete's timezone." },
  title: { type: "string", description: 'Shown on TODAY, e.g. "HYROX Upper"' },
  workout_type: { type: "string", enum: ["upper", "lower", "full_body", "hyrox", "run", "simulation", "conditioning", "recovery", "other"] },
  coach_reason: { type: "string", maxLength: 2000, description: "Why this session today (shown to the athlete)." },
  estimated_duration_min: { type: "integer" },
  exercises: { type: "array", maxItems: 30, items: exerciseTarget },
};

export function buildOpenApi(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "HYROX AI Coach API",
      version: "1.0.0",
      description:
        "Read the athlete's training, recovery, running, HYROX and body data, and write workout plans that appear in the app's TODAY screen. Units: kg, meters, seconds (or m:ss), pace per km.",
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/coach/context": {
        get: {
          operationId: "getCoachContext",
          summary: "Summarised context for today's coaching decision",
          description: "Call first when the athlete wants to train or asks about progress. Readiness, body trend, load/ACWR, last sessions, running, HYROX, key lifts (last 3 sessions + progression hint), today's plans.",
          responses: { "200": json(obj), ...errors },
        },
      },
      "/api/coach/exercises": {
        get: { operationId: "listExercises", summary: "Valid exercise ids and how each is logged", responses: { "200": json(obj), ...errors } },
      },
      "/api/coach/exercises/{id}/history": {
        get: {
          operationId: "getExerciseHistory",
          summary: "Recent sessions, PBs, e1RM, volume, RPE and a progression hint for one exercise",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, intQuery("sessions", "How many recent sessions (1-20, default 5)")],
          responses: { "200": json(obj), "404": json(errorRef, "Unknown exercise"), ...errors },
        },
      },
      "/api/coach/workouts": {
        get: {
          operationId: "listWorkoutPlans",
          summary: "Workout plans in a date range (default last 7 to next 14 days)",
          parameters: [dateParam("from", "YYYY-MM-DD"), dateParam("to", "YYYY-MM-DD")],
          responses: { "200": json(obj), ...errors },
        },
        post: {
          operationId: "createWorkoutPlan",
          summary: "Create a workout plan (shows on TODAY when date is today)",
          description: "Use replace_existing=true to replace not-yet-started plans on that date. Set idempotency_key (e.g. '2026-10-06-upper') to make retries safe.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["workout_type"],
                  properties: {
                    ...planFields,
                    replace_existing: { type: "boolean", default: false },
                    idempotency_key: { type: "string", maxLength: 100 },
                  },
                },
              },
            },
          },
          responses: { "201": json(obj, "Created"), "200": json(obj, "Existing plan for this idempotency_key"), "422": json(errorRef, "Unknown exercise id (details.valid_ids lists valid ones)"), ...errors },
        },
      },
      "/api/coach/workouts/{id}": {
        get: {
          operationId: "getWorkoutPlan",
          summary: "A plan with what was actually done against it",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": json(obj), "404": json(errorRef, "Not found"), ...errors },
        },
        put: {
          operationId: "updateWorkoutPlan",
          summary: "Replace fields and/or all exercises of a plan that has not started",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: planFields } } } },
          responses: { "200": json(obj), "409": json(errorRef, "Plan already started"), ...errors },
        },
        patch: {
          operationId: "setWorkoutPlanStatus",
          summary: "Skip, cancel or restore a plan, or update coach_reason",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", enum: ["planned", "skipped", "cancelled"] }, coach_reason: { type: "string" } } } } },
          },
          responses: { "200": json(obj), "409": json(errorRef, "Plan already started or done"), ...errors },
        },
        delete: {
          operationId: "cancelWorkoutPlan",
          summary: "Cancel a plan that has not started",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": json(obj), ...errors },
        },
      },
      "/api/coach/sessions": {
        get: {
          operationId: "listWorkoutResults",
          summary: "Logged workouts with every set vs target (default last 14 days)",
          parameters: [dateParam("from", "YYYY-MM-DD"), dateParam("to", "YYYY-MM-DD"), intQuery("limit", "1-60, default 20")],
          responses: { "200": json(obj), ...errors },
        },
      },
      "/api/coach/runs": {
        get: {
          operationId: "listRuns",
          summary: "Runs with pace, HR, zones and splits (default last 30 days)",
          parameters: [dateParam("from", "YYYY-MM-DD"), dateParam("to", "YYYY-MM-DD"), intQuery("limit", "1-200")],
          responses: { "200": json(obj), ...errors },
        },
        post: {
          operationId: "logRun",
          summary: "Log a run the athlete reports",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["run_type", "distance_km", "duration_seconds"],
                  properties: {
                    date: { type: "string", format: "date" },
                    run_type: { type: "string", enum: ["easy", "zone2", "tempo", "threshold", "intervals", "hyrox_run", "long_run", "recovery"] },
                    distance_km: { type: "number" },
                    duration_seconds: { type: "string", description: 'seconds or "h:mm:ss" / "mm:ss"' },
                    average_hr: { type: "integer" },
                    max_hr: { type: "integer" },
                    rpe: { type: "number" },
                    notes: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "201": json(obj, "Created"), ...errors },
        },
      },
      "/api/coach/hyrox": {
        get: {
          operationId: "getHyroxAnalysis",
          summary: "HYROX results, station PB/latest/trend and relative weaknesses",
          parameters: [intQuery("limit", "Results to include (1-50, default 10)")],
          responses: { "200": json(obj), ...errors },
        },
        post: {
          operationId: "logHyroxResult",
          summary: "Log a HYROX race or simulation with splits",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["event_type", "splits"],
                  properties: {
                    date: { type: "string", format: "date" },
                    event_type: { type: "string", enum: ["race", "simulation", "partial"] },
                    name: { type: "string" },
                    splits: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["segment_index", "duration_seconds"],
                        properties: {
                          segment_index: { type: "integer", minimum: 1, maximum: 16, description: "1 Run1, 2 SkiErg, 3 Run2, 4 Sled Push, 5 Run3, 6 Sled Pull, 7 Run4, 8 Burpee Broad Jump, 9 Run5, 10 RowErg, 11 Run6, 12 Farmer's Carry, 13 Run7, 14 Sandbag Lunges, 15 Run8, 16 Wall Balls" },
                          duration_seconds: { type: "string", description: 'seconds or "m:ss"' },
                        },
                      },
                    },
                    roxzone_total_seconds: { type: "string" },
                    total_seconds: { type: "string", description: "Official finish time (optional)" },
                  },
                },
              },
            },
          },
          responses: { "201": json(obj, "Created"), ...errors },
        },
      },
      "/api/coach/body": {
        get: {
          operationId: "getBodyTrend",
          summary: "Weight entries and trend (7-day avg, weekly/monthly change, loss rate)",
          parameters: [intQuery("days", "7-730, default 60")],
          responses: { "200": json(obj), ...errors },
        },
        post: {
          operationId: "logBodyMetrics",
          summary: "Log weight / body fat for a date",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", properties: { date: { type: "string", format: "date" }, weight: { type: "number" }, body_fat_percentage: { type: "number" }, muscle_mass: { type: "number" } } },
              },
            },
          },
          responses: { "201": json(obj, "Saved"), ...errors },
        },
      },
      "/api/coach/health": {
        get: {
          operationId: "getHealthMetrics",
          summary: "Daily sleep, HRV, resting HR, steps",
          parameters: [intQuery("days", "1-365, default 14")],
          responses: { "200": json(obj), ...errors },
        },
        post: {
          operationId: "logHealthMetrics",
          summary: "Log sleep / HRV / resting HR (one day, or {metrics:[...]})",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    date: { type: "string", format: "date" },
                    sleep_minutes: { type: "integer" },
                    hrv: { type: "number", description: "ms" },
                    resting_hr: { type: "integer" },
                    steps: { type: "integer" },
                    weight: { type: "number" },
                    source: { type: "string", enum: ["manual", "apple_health", "import"] },
                  },
                },
              },
            },
          },
          responses: { "201": json(obj, "Saved"), ...errors },
        },
      },
      "/api/coach/insights": {
        get: { operationId: "listCoachNotes", summary: "Coach notes shown in the app", parameters: [intQuery("limit", "1-50")], responses: { "200": json(obj), ...errors } },
        post: {
          operationId: "postCoachNote",
          summary: "Post a short analysis note to the app's AI INSIGHTS area",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["body"],
                  properties: {
                    title: { type: "string", maxLength: 120 },
                    body: { type: "string", maxLength: 2000 },
                    category: { type: "string", enum: ["training", "recovery", "body", "running", "hyrox", "general"] },
                  },
                },
              },
            },
          },
          responses: { "201": json(obj, "Created"), ...errors },
        },
      },
      "/api/coach/ping": {
        get: { operationId: "ping", summary: "Check that the token works", responses: { "200": json(obj), ...errors } },
      },
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "Coach API token from the app: Profile → AI Coach API" } },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: { code: { type: "string" }, message: { type: "string" }, details: {} },
            },
          },
        },
      },
    },
  };
}
