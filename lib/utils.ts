import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function boolEnv(value: string | undefined) {
  return value === "true" || value === "1";
}
