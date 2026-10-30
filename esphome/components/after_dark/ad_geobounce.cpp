/*
 * ad_geobounce.cpp - GeoBounce, a Platonic solid loose on the screen. A port
 * of all/modules/geobounce.js, which was checked against GEOBOUNC.AD under
 * Wine; see that file for what was measured (size, face colours, the dither
 * ladder) and what was chosen (speed, spin, the light direction).
 *
 * Defaults are the module's: Tetrahedron, Size 54, Speed 28, Faces Both.
 *
 * It erases the box the solid was drawn in last frame rather than clearing the
 * screen, which is all black but the solid, so only that box changes.
 *
 * Adapted for small screens:
 *  - The size is 0.4 x Size px at 768 lines, scaled with the screen height as
 *    on the web, which leaves a tetrahedron 4 px across on a 64-line OLED.
 *    Where that radius comes out under 6 px it is raised to 8 (10 on a 1-bit
 *    panel), or a fifth of the height if less; 320x240 is left as it is.
 *  - On a 1-bit panel the face colours and the module's 2x2 dither ladder,
 *    put through the panel's own ordered dither, leave a few scattered dots.
 *    So there each visible face is a flat grey of its light, from a quarter
 *    (facing away) to white (facing the light), dithered once, with the
 *    module's black outlines between the faces: Shading, more or less.
 * No character LCD version: on the dot grid the solid is a dozen dots with a
 * cell gap through it, not a solid.
 */
#if defined(AD_SAVER_GEOBOUNCE) || defined(AD_ALL_SAVERS)
#include "ad_core.h"
#include "ad_draw.h"

namespace adcore {

namespace {

enum Shape { TETRAHEDRON, CUBE, OCTAHEDRON, DODECAHEDRON, ICOSAHEDRON };
enum Faces { SHADING, COLORS, BOTH };

/* Bright and dark of each face colour, in face order; then the greys. */
const Rgb HUES[6][2] = {{{255, 0, 0}, {128, 0, 0}},   {{0, 255, 0}, {0, 128, 0}},
                        {{0, 0, 255}, {0, 0, 128}},   {{255, 255, 0}, {128, 128, 0}},
                        {{0, 255, 255}, {0, 128, 128}}, {{255, 0, 255}, {128, 0, 128}}};
const Rgb GREYS[2] = {{255, 255, 255}, {128, 128, 128}};
/* 2x2 ordered dither: which quarter-steps light which pixel. */
const int BAYER2[2][2] = {{0, 2}, {3, 1}};
const float PI = 3.14159265f;
const int MAX_V = 20, MAX_F = 20, MAX_K = 5;

struct V3 {
  float x, y, z;
};
V3 sub(V3 a, V3 b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
V3 cross(V3 a, V3 b) { return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x}; }
float dot(V3 a, V3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
V3 norm(V3 a) {
  float l = sqrtf(dot(a, a));
  return {a.x / l, a.y / l, a.z / l};
}
float dist(V3 a, V3 b) {
  V3 d = sub(a, b);
  return sqrtf(dot(d, d));
}

struct Solid {
  V3 v[MAX_V];
  int nv = 0;
  uint8_t f[MAX_F][MAX_K];
  uint8_t fn[MAX_F];
  int nf = 0;
};

/* Triangles of mutually nearest vertices: the faces of the deltahedra. */
void triangles(Solid &s) {
  float edge = 1e9f;
  for (int i = 0; i < s.nv; i++)
    for (int j = i + 1; j < s.nv; j++)
      edge = fminf(edge, dist(s.v[i], s.v[j]));
  auto near = [&](int a, int b) { return fabsf(dist(s.v[a], s.v[b]) - edge) < edge * 0.01f; };
  s.nf = 0;
  for (int i = 0; i < s.nv; i++)
    for (int j = i + 1; j < s.nv; j++)
      for (int k = j + 1; k < s.nv; k++)
        if (near(i, j) && near(j, k) && near(i, k) && s.nf < MAX_F) {
          s.f[s.nf][0] = i;
          s.f[s.nf][1] = j;
          s.f[s.nf][2] = k;
          s.fn[s.nf++] = 3;
        }
}

/* The dual: a vertex at each face's centre, a face round each old vertex. */
Solid dual(const Solid &s) {
  Solid d;
  d.nv = s.nf;
  for (int fi = 0; fi < s.nf; fi++) {
    V3 c = {0, 0, 0};
    for (int k = 0; k < s.fn[fi]; k++) {
      c.x += s.v[s.f[fi][k]].x;
      c.y += s.v[s.f[fi][k]].y;
      c.z += s.v[s.f[fi][k]].z;
    }
    d.v[fi] = norm(c);
  }
  d.nf = s.nv;
  for (int vi = 0; vi < s.nv; vi++) {
    uint8_t ring[MAX_K + 1];
    int n = 0;
    for (int fi = 0; fi < s.nf && n < MAX_K; fi++)
      for (int k = 0; k < s.fn[fi]; k++)
        if (s.f[fi][k] == vi) {
          ring[n++] = fi;
          break;
        }
    /* Round the vertex in order. */
    V3 p = s.v[vi], nrm = norm(p), ref = sub(d.v[ring[0]], p), up = cross(nrm, ref);
    float ang[MAX_K + 1];
    for (int i = 0; i < n; i++) {
      V3 da = sub(d.v[ring[i]], p);
      ang[i] = atan2f(dot(da, up), dot(da, ref));
    }
    for (int a = 1; a < n; a++)
      for (int b = a; b > 0 && ang[b - 1] > ang[b]; b--) {
        float t = ang[b];
        ang[b] = ang[b - 1];
        ang[b - 1] = t;
        uint8_t r = ring[b];
        ring[b] = ring[b - 1];
        ring[b - 1] = r;
      }
    for (int i = 0; i < n; i++)
      d.f[vi][i] = ring[i];
    d.fn[vi] = n;
  }
  return d;
}

Solid make_solid(int shape) {
  Solid s;
  if (shape == TETRAHEDRON) {
    const V3 t[4] = {{1, 1, 1}, {1, -1, -1}, {-1, 1, -1}, {-1, -1, 1}};
    for (const V3 &p : t)
      s.v[s.nv++] = p;
  } else if (shape == OCTAHEDRON || shape == CUBE) {
    const V3 o[6] = {{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1}};
    for (const V3 &p : o)
      s.v[s.nv++] = p;
  } else {
    const float phi = (1 + sqrtf(5)) / 2;
    for (int i = 0; i < 2; i++)
      for (int j = 0; j < 2; j++) {
        float a = i ? 1.0f : -1.0f, b = j ? phi : -phi;
        s.v[s.nv++] = {0, a, b};
        s.v[s.nv++] = {a, b, 0};
        s.v[s.nv++] = {b, 0, a};
      }
  }
  for (int i = 0; i < s.nv; i++)
    s.v[i] = norm(s.v[i]);
  triangles(s);
  if (shape == CUBE || shape == DODECAHEDRON)
    s = dual(s);
  /* Wind every face outward. */
  for (int fi = 0; fi < s.nf; fi++) {
    V3 a = s.v[s.f[fi][0]];
    V3 n = cross(sub(s.v[s.f[fi][1]], a), sub(s.v[s.f[fi][2]], a));
    if (dot(n, a) < 0)
      for (int i = 0, j = s.fn[fi] - 1; i < j; i++, j--) {
        uint8_t t = s.f[fi][i];
        s.f[fi][i] = s.f[fi][j];
        s.f[fi][j] = t;
      }
  }
  return s;
}

class GeoBounce : public Saver {
 public:
  int shape = TETRAHEDRON;
  float size = 54;
  float speed = 28;
  int faces = BOTH;

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    mono_ = s.mono();
    s.clear();
    solid_ = make_solid(shape);
    r_ = fmaxf(2, 0.4f * size * h_ / 768);
    float floor_r = fminf(mono_ ? 10 : 8, h_ / 5.0f);
    if (r_ < 6 && r_ < floor_r)
      r_ = floor_r;
    x_ = rng.range(r_, w_ - r_);
    y_ = rng.range(r_, h_ - r_);
    float a = rng.range(0, PI * 2), v = (40 + speed * 6) * h_ / 768;
    vx_ = cosf(a) * v;
    vy_ = sinf(a) * v;
    rx_ = rng.range(0, 6);
    ry_ = rng.range(0, 6);
    wx_ = rng.range(0.6f, 1.4f) * (0.5f + speed / 40);
    wy_ = rng.range(0.5f, 1.2f) * (0.5f + speed / 40);
    last_ = Rect{0, 0, 0, 0};
  }

  void frame(Surface &s, float dt) override {
    float r = r_;
    x_ += vx_ * dt;
    y_ += vy_ * dt;
    if (x_ < r) {
      x_ = r;
      vx_ = fabsf(vx_);
    }
    if (x_ > w_ - r) {
      x_ = w_ - r;
      vx_ = -fabsf(vx_);
    }
    if (y_ < r) {
      y_ = r;
      vy_ = fabsf(vy_);
    }
    if (y_ > h_ - r) {
      y_ = h_ - r;
      vy_ = -fabsf(vy_);
    }
    rx_ += wx_ * dt;
    ry_ += wy_ * dt;

    float cx = cosf(rx_), sx = sinf(rx_), cy = cosf(ry_), sy = sinf(ry_);
    V3 pts[MAX_V];
    int px[MAX_V], py[MAX_V];
    int x0 = w_, y0 = h_, x1 = -1, y1 = -1;
    for (int i = 0; i < solid_.nv; i++) {
      const V3 &p = solid_.v[i];
      float yy = p.y * cx - p.z * sx, z1 = p.y * sx + p.z * cx;
      float xx = p.x * cy + z1 * sy, z2 = -p.x * sy + z1 * cy;
      pts[i] = {xx, yy, z2};
      px[i] = round_half_up(x_ + xx * r);
      py[i] = round_half_up(y_ + yy * r);
      x0 = px[i] < x0 ? px[i] : x0;
      y0 = py[i] < y0 ? py[i] : y0;
      x1 = px[i] > x1 ? px[i] : x1;
      y1 = py[i] > y1 ? py[i] : y1;
    }

    s.fill(last_, BLACK);
    last_ = Rect{x0, y0, x1 - x0 + 1, y1 - y0 + 1};

    const V3 light = norm({-0.4f, -0.5f, 1});
    for (int fi = 0; fi < solid_.nf; fi++) {
      const uint8_t *f = solid_.f[fi];
      int n = solid_.fn[fi];
      V3 a = pts[f[0]];
      V3 nv = norm(cross(sub(pts[f[1]], a), sub(pts[f[2]], a)));
      if (nv.z <= 0)
        continue;
      const Rgb *pair = faces == SHADING ? GREYS : HUES[fi % 6];
      float lit = fmaxf(0, dot(nv, light));
      int step = faces == COLORS ? 8 : round_half_up(1 + lit * 7);
      int xy[2 * MAX_K];
      for (int i = 0; i < n; i++) {
        xy[2 * i] = px[f[i]];
        xy[2 * i + 1] = py[f[i]];
      }
      if (mono_) {
        /* Its light on a ladder of its own, the darkest face a quarter lit. */
        int g = round_half_up(255 * (0.25f + 0.75f * lit));
        fill_polygon(s, xy, n, rgb(g, g, g));
      } else {
        fill_dithered(s, xy, n, pair, step);
      }
      polygon(s, xy, n, BLACK);
    }
  }

 private:
  /* Fill for brightness step 0..8 of a face: 0 black, 4 the dark colour, 8 the
     bright one, and 2x2 dithered mixes between, the pattern fixed to the
     screen as a canvas pattern is. */
  static Rgb ladder(const Rgb *pair, int step, int x, int y) {
    if (step >= 8)
      return pair[0];
    if (step == 4)
      return pair[1];
    if (step <= 0)
      return BLACK;
    Rgb lo = step < 4 ? BLACK : pair[1], hi = step < 4 ? pair[1] : pair[0];
    return BAYER2[y & 1][x & 1] < step % 4 ? hi : lo;
  }

  /* ad_draw's fill_polygon (pixel centres, even-odd), a pixel at a time. */
  static void fill_dithered(Surface &s, const int *xy, int n, const Rgb *pair, int step) {
    int top = xy[1], bottom = xy[1];
    for (int i = 1; i < n; i++) {
      top = xy[2 * i + 1] < top ? xy[2 * i + 1] : top;
      bottom = xy[2 * i + 1] > bottom ? xy[2 * i + 1] : bottom;
    }
    if (top < 0)
      top = 0;
    if (bottom >= s.height())
      bottom = s.height() - 1;
    int xs[MAX_K];
    for (int y = top; y <= bottom; y++) {
      float fy = y + 0.5f;
      int k = 0;
      for (int i = 0; i < n; i++) {
        int j = (i + 1) % n;
        float ya = xy[2 * i + 1], yb = xy[2 * j + 1];
        if ((ya <= fy && yb > fy) || (yb <= fy && ya > fy)) {
          float xa = xy[2 * i], xb = xy[2 * j];
          xs[k++] = (int) floorf(xa + (fy - ya) / (yb - ya) * (xb - xa) + 0.5f);
        }
      }
      for (int a = 1; a < k; a++)
        for (int b = a; b > 0 && xs[b - 1] > xs[b]; b--) {
          int t = xs[b];
          xs[b] = xs[b - 1];
          xs[b - 1] = t;
        }
      for (int a = 0; a + 1 < k; a += 2)
        for (int x = xs[a]; x < xs[a + 1]; x++)
          plot(s, x, y, ladder(pair, step, x, y));
    }
  }

  int w_ = 0, h_ = 0;
  bool mono_ = false;
  Solid solid_;
  float r_ = 2, x_ = 0, y_ = 0, vx_ = 0, vy_ = 0, rx_ = 0, ry_ = 0, wx_ = 0, wy_ = 0;
  Rect last_ = {0, 0, 0, 0};
};

}  // namespace

Saver *make_geobounce() { return new GeoBounce(); }

AD_REGISTER_SAVER("geobounce", make_geobounce, nullptr)

}  // namespace adcore
#endif
