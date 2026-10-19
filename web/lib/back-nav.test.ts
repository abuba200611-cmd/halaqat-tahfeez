import { describe, expect, it } from "vitest";
import { canGoBackInApp, pushPath, resolveBack } from "./back-nav";

describe("resolveBack", () => {
  it("hides on every role home and /welcome", () => {
    for (const p of ["/", "/student", "/parent", "/mosque", "/association", "/dev", "/welcome"]) {
      expect(resolveBack(p).show, p).toBe(false);
    }
  });
  it("teacher", () => {
    expect(resolveBack("/students")).toEqual({ show: true, fallback: "/" });
    expect(resolveBack("/students/12")).toEqual({ show: true, fallback: "/students" });
    expect(resolveBack("/students/import").fallback).toBe("/students");
    expect(resolveBack("/cases/3").fallback).toBe("/cases");
    expect(resolveBack("/exams/9").fallback).toBe("/exams");
    expect(resolveBack("/discipline/print").fallback).toBe("/discipline");
    expect(resolveBack("/settings").fallback).toBe("/");
  });
  it("student", () => {
    expect(resolveBack("/student/log").fallback).toBe("/student");
    expect(resolveBack("/student-join").fallback).toBe("/welcome");
  });
  it("parent", () => {
    expect(resolveBack("/parent/exams").fallback).toBe("/parent");
    expect(resolveBack("/parent/fees/receipt").fallback).toBe("/parent/fees");
    expect(resolveBack("/parent/login").fallback).toBe("/welcome");
  });
  it("mosque", () => {
    expect(resolveBack("/mosque/settings").fallback).toBe("/mosque");
    expect(resolveBack("/mosque/5")).toEqual({ show: true, fallback: "/mosque" });
    expect(resolveBack("/mosque/5/fees").fallback).toBe("/mosque/5");
    expect(resolveBack("/mosque/5/supervisor-visits/7").fallback).toBe("/mosque/5/supervisor-visits");
    expect(resolveBack("/mosque/5/supervisor-visits/7/print").fallback).toBe("/mosque/5/supervisor-visits/7");
    expect(resolveBack("/mosque/5/exams/certificates/2/print").fallback).toBe("/mosque/5/exams");
    expect(resolveBack("/mosque/5/fees/3/receipt/4").fallback).toBe("/mosque/5/fees");
    expect(resolveBack("/mosque/5/halaqah/8").fallback).toBe("/mosque/5");
    expect(resolveBack("/mosque/5/evaluation/criteria").fallback).toBe("/mosque/5/evaluation");
  });
  it("association", () => {
    expect(resolveBack("/association/visits").fallback).toBe("/association");
    expect(resolveBack("/association/visits/3").fallback).toBe("/association/visits");
    expect(resolveBack("/association/visits/3/print").fallback).toBe("/association/visits/3");
    expect(resolveBack("/association/mosques/2").fallback).toBe("/association");
  });
  it("dev", () => {
    expect(resolveBack("/dev/users").fallback).toBe("/dev");
  });
  it("public", () => {
    for (const p of ["/login", "/signup", "/register-mosque", "/forgot-password", "/mosque-login", "/association-login", "/j/4", "/verify/abc"]) {
      expect(resolveBack(p), p).toEqual({ show: true, fallback: "/welcome" });
    }
    expect(resolveBack("/j/4/schedule").fallback).toBe("/j/4");
  });
  it("ignores trailing slash and query", () => {
    expect(resolveBack("/students/?x=1").fallback).toBe("/");
  });
});

describe("history stack", () => {
  it("tracks forward/back", () => {
    let s: string[] = [];
    s = pushPath(s, "/students");
    expect(canGoBackInApp(s)).toBe(false);
    s = pushPath(s, "/students/1");
    expect(canGoBackInApp(s)).toBe(true);
    s = pushPath(s, "/students/1");
    expect(s).toHaveLength(2);
    s = pushPath(s, "/students");
    expect(s).toEqual(["/students"]);
    expect(canGoBackInApp(s)).toBe(false);
  });
});
