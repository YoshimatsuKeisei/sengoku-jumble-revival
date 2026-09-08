# TRAP boundary and active-state evidence

The recovered SWF-derived battlefield logic uses source-space center X = 900. Runtime world coordinates must be converted back to SWF source coordinates before deciding whether a soldier has entered the opposing half. Treating 900 as a world-space coordinate shifts the boundary and previously produced the invisible-line symptom.

The recovered TRAP timing uses a 10 logic-tick action lock and a 20 logic-tick trap state. While the trap state is active, the same moving invader is not eligible for another TRAP draw. These values are treated as confirmed SWF-derived constants; they must not be tuned merely to hide runtime jitter.
