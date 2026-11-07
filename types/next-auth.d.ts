import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "TEACHER" | "STUDENT";
      canManageGrades: boolean;
    } & DefaultSession["user"];
  }
  interface User {
    role: "ADMIN" | "TEACHER" | "STUDENT";
    canManageGrades: boolean;
  }
}
