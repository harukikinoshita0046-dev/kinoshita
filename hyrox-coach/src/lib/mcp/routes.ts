import "server-only";

import type { NextRequest } from "next/server";
import * as body from "@/app/api/coach/body/route";
import * as context from "@/app/api/coach/context/route";
import * as exerciseHistory from "@/app/api/coach/exercises/[id]/history/route";
import * as exercises from "@/app/api/coach/exercises/route";
import * as health from "@/app/api/coach/health/route";
import * as hyrox from "@/app/api/coach/hyrox/route";
import * as insights from "@/app/api/coach/insights/route";
import * as ping from "@/app/api/coach/ping/route";
import * as runs from "@/app/api/coach/runs/route";
import * as sessions from "@/app/api/coach/sessions/route";
import * as workout from "@/app/api/coach/workouts/[id]/route";
import * as workouts from "@/app/api/coach/workouts/route";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type RouteHandler = (req: NextRequest, route: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** The coach API route modules, keyed by their OpenAPI path template. MCP tools call these directly. */
export const COACH_ROUTES = {
  "/api/coach/context": context,
  "/api/coach/exercises": exercises,
  "/api/coach/exercises/{id}/history": exerciseHistory,
  "/api/coach/workouts": workouts,
  "/api/coach/workouts/{id}": workout,
  "/api/coach/sessions": sessions,
  "/api/coach/runs": runs,
  "/api/coach/hyrox": hyrox,
  "/api/coach/body": body,
  "/api/coach/health": health,
  "/api/coach/insights": insights,
  "/api/coach/ping": ping,
} as unknown as Record<string, Partial<Record<Method, RouteHandler>>>;
