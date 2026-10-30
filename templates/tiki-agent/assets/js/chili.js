/* ============================================================
   tiki chili — procedural raymarched chili runner
   feeds TikiAscii. no meshes, no textures, no external models.
   ============================================================ */
(() => {
  const SCENE = `
  float h11(float n){ return fract(sin(n * 127.1) * 43758.5453); }
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

  float sdCap(vec3 p, vec3 a, vec3 b, float r){
    vec3 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
  }
  float sdEllip(vec3 p, vec3 r){
    float k0 = length(p / r);
    float k1 = length(p / (r * r));
    return k0 * (k0 - 1.0) / max(k1, 1e-5);
  }
  vec3 toLocal(vec3 p, vec3 pos, float sc, float lean){
    vec3 q = (p - pos) / sc;
    float c = cos(lean), s = sin(lean);
    return vec3(q.x * c + q.y * s, -q.x * s + q.y * c, q.z);
  }

  float spineX(float ty){ return 0.38 * sin(ty * 1.70); }
  float spineZ(float ty){ return 0.22 * sin(ty * 2.20); }

  vec2 mapChar(vec3 p, float ph){
    vec2 res = vec2(1e5, 0.0);

    float ty = clamp((p.y + 1.05) / 1.75, 0.0, 1.0);
    float qx = p.x - spineX(ty);
    float qz = p.z - spineZ(ty);
    float rad = (0.016 + 0.340 * smoothstep(0.0, 0.42, ty))
              * (1.0 - 0.42 * smoothstep(0.70, 1.0, ty));
    float ang = atan(qz, qx);
    rad *= 1.0 + 0.05 * sin(ang * 5.0 + ty * 2.0);
    float dB = max(length(vec2(qx, qz)) - rad, max(-1.05 - p.y, p.y - 0.70));
    if (dB < res.x) res = vec2(dB, 1.0);

    vec3 top = vec3(spineX(0.97), 0.68, spineZ(0.97));
    float dS = sdCap(p, top, top + vec3(0.14, 0.50, 0.05), 0.042);
    if (dS < res.x) res = vec2(dS, 2.0);

    float dL = sdEllip(p - vec3(spineX(1.0) - 0.08, 0.92, spineZ(1.0)), vec3(0.24, 0.04, 0.09));
    if (dL < res.x) res = vec2(dL, 3.0);

    for (int i = 0; i < 2; i++){
      float k = float(i) * 3.14159265;
      float sn = sin(ph + k);
      float cs = cos(ph + k);
      float side = i == 0 ? -1.0 : 1.0;
      vec3 hip  = vec3(spineX(0.20) + 0.075 * side, -0.82, spineZ(0.20));
      vec3 knee = hip + vec3(0.10 * sn, -0.22, 0.05 * cs);
      vec3 foot = knee + vec3(0.24 * sn, -0.22 + 0.16 * max(0.0, -cs), 0.02);
      float dl = min(sdCap(p, hip, knee, 0.050), sdCap(p, knee, foot, 0.040));
      if (dl < res.x) res = vec2(dl, 4.0);
      float df = sdCap(p, foot, foot + vec3(0.14, -0.01, 0.0), 0.058);
      if (df < res.x) res = vec2(df, 5.0);
    }
    return res;
  }
  float traceChar(vec3 ro, vec3 rd, vec3 pos, float sc, float lean, float ph, out float mat){
    mat = 0.0;
    vec3 oc = ro - pos;
    float b = dot(oc, rd);
    float h = b * b - (dot(oc, oc) - 1.62 * sc * 1.62 * sc);
    if (h < 0.0) return -1.0;
    h = sqrt(h);
    float t = max(-b - h, 0.0);
    float tmax = -b + h;
    for (int i = 0; i < 90; i++){
      vec3 p = ro + rd * t;
      vec2 r = mapChar(toLocal(p, pos, sc, lean), ph);
      if (r.x < 0.0025) { mat = r.y; return t; }
      t += max(r.x * 0.9, 0.001) * sc;
      if (t > tmax) break;
    }
    return -1.0;
  }

  vec3 normAt(vec3 p, vec3 pos, float sc, float lean, float ph){
    float e = 0.010;
    float a = mapChar(toLocal(p + vec3(e, 0.0, 0.0), pos, sc, lean), ph).x;
    float b = mapChar(toLocal(p - vec3(e, 0.0, 0.0), pos, sc, lean), ph).x;
    float c = mapChar(toLocal(p + vec3(0.0, e, 0.0), pos, sc, lean), ph).x;
    float d = mapChar(toLocal(p - vec3(0.0, e, 0.0), pos, sc, lean), ph).x;
    float f = mapChar(toLocal(p + vec3(0.0, 0.0, e), pos, sc, lean), ph).x;
    float g = mapChar(toLocal(p - vec3(0.0, 0.0, e), pos, sc, lean), ph).x;
    return normalize(vec3(a - b, c - d, f - g));
  }

  vec4 shade(vec3 n, vec3 rd, float mat, float boost){
    vec3 L = normalize(vec3(-0.55, 0.78, 0.72));
    float dif = max(dot(n, L), 0.0);
    float fill = max(dot(n, normalize(vec3(0.55, 0.10, 0.60))), 0.0) * 0.28;
    float spec = pow(max(dot(reflect(rd, n), L), 0.0), 34.0);
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.4);

    vec3 base = vec3(0.95, 0.10, 0.07);
    if (mat > 1.5 && mat < 2.5) base = vec3(0.26, 0.44, 0.22);
    else if (mat > 2.5 && mat < 3.5) base = vec3(0.34, 0.58, 0.28);
    else if (mat > 3.5 && mat < 4.5) base = vec3(0.78, 0.08, 0.05);
    else if (mat > 4.5) base = vec3(1.00, 0.74, 0.48);

    vec3 col = base * (0.30 + 0.75 * dif + fill)
             + spec * vec3(1.0, 0.80, 0.64)
             + rim * vec3(1.0, 0.26, 0.12);
    float a = clamp(0.04 + 0.95 * dif + fill + 0.80 * rim + spec * 0.85, 0.0, 1.0) * boost;
    return vec4(col, a);
  }
  vec4 renderScene(vec2 uv, vec2 res){
    float A = (res.x / res.y) * 0.60;
    float visH = 0.824;
    float visW = visH * A;
    float sc = min(mix(0.532, 0.512, uStyle), 0.62 * visW);
    float cenWide = mix(0.56, 0.70, smoothstep(0.9, 1.9, A));
    float cenX = mix(0.60, cenWide, smoothstep(0.85, 1.15, A));
    cenX = mix(cenX, 0.5, uStyle);
    vec2 cen = vec2(cenX, 0.477);
    vec2 sp = (uv - cen) * vec2(A, 1.0);

    vec3 ro = vec3(0.0, 0.02, 4.2);
    vec3 rd = normalize(vec3(sp * mix(1.0, 0.70, uStyle) + (m - 0.5) * 0.12, -2.55));

    float glow = 0.045 * exp(-dot(sp, sp) * 11.0);
    float streak = 0.0;
    for (int i = 0; i < 6; i++){
      float fi = float(i);
      float yy = 0.10 + 0.80 * h11(fi * 3.7 + 1.3);
      float vx = 0.55 + 0.85 * h11(fi * 7.1);
      float x = fract(uv.x * 1.15 - t * vx * (0.55 + uAct) + h11(fi * 5.3));
      float len = 0.03 + 0.11 * h11(fi * 9.9);
      float w = 0.0016 + 0.0022 * h11(fi * 2.1);
      streak += smoothstep(w, 0.0, abs(uv.y - yy))
              * smoothstep(0.0, 0.012, x)
              * smoothstep(len, 0.008, x);
    }
    vec3 col = vec3(1.0, 0.27, 0.15) * (glow * 0.5 + streak * 0.30);
    float alpha = clamp(glow * 0.75 + streak * 0.34, 0.0, 0.5);

    float run = 10.5 + 11.0 * uAct;
    float ph = t * run;
    float bob = sin(t * 15.0) * 0.035 * (0.7 + uAct);
    vec3 pos = vec3(0.0, bob, 0.0);
    float lean = 0.16 + 0.04 * uAct;
    float best = 0.0;

    for (int g = 3; g >= 0; g--){
      float fg = float(g);
      vec3 gp = pos - vec3(fg * 0.26, 0.0, 0.0);
      float gsc = sc * (1.0 - fg * 0.015);
      float gph = ph - fg * 0.26 * (1.0 + uAct);
      float boost = g == 0 ? 1.0 : (0.50 / (1.0 + fg * 1.15));
      float mh = 0.0;
      float hit = traceChar(ro, rd, gp, gsc, lean, gph, mh);
      if (hit > 0.0){
        vec3 p = ro + rd * hit;
        vec3 n = normAt(p, gp, gsc, lean, gph);
        vec4 s = shade(n, rd, mh, boost);
        if (s.a > best){
          best = s.a;
          col = s.rgb * (g == 0 ? 1.0 : 0.86);
        }
      }
    }

    return vec4(pow(max(col, vec3(0.0)), vec3(0.92)), clamp(max(alpha, best), 0.0, 1.0));
  }
  `;

  window.TIKI_SCENE = SCENE;
})();
