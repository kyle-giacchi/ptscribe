# Site DNA — Glossar (https://glossar.app/)

AUDIT_MODE: standard

---

## 1.1 — PAGE ARCHITECTURE

Total viewport sections: 6 (+ 1 sr-only SEO header)
Section-identification strategy used: `<section>` tags (7 found, 6 visible)

```
╔══════════════════════════════════════════════════════╗
║  NAV BAR (sticky, fixed top)          HEIGHT: ~100px ║
║  BG: black #000000 pill shape                        ║
║  LAYOUT: max-w ~420px centered, flex row             ║
╠══════════════════════════════════════════════════════╣
║  SECTION 1: HERO                      HEIGHT: 420px  ║
║  BG: transparent (body bg #F5F5F7 shows through)     ║
║  LAYOUT: single column, center-aligned               ║
╠══════════════════════════════════════════════════════╣
║  SECTION 2: FEATURE STORY             HEIGHT: 5453px ║
║  BG: white/light grey card (#F5F5F7), rounded ~20px  ║
║  LAYOUT: single column, centered phone mockup sticky ║
╠══════════════════════════════════════════════════════╣
║  SECTION 3: LEVELS                    HEIGHT: 860px  ║
║  BG: white / transparent                             ║
║  LAYOUT: left-aligned text + level pills row         ║
╠══════════════════════════════════════════════════════╣
║  SECTION 4: SHOWCASE                  HEIGHT: 1333px ║
║  BG: light grey card, large border-radius ~20px      ║
║  LAYOUT: centered phone mockup + text blocks         ║
╠══════════════════════════════════════════════════════╣
║  SECTION 5: VOCABULARY CARDS          HEIGHT: 940px  ║
║  BG: light grey card, large border-radius ~20px      ║
║  LAYOUT: headline above, 3-col card row below        ║
╠══════════════════════════════════════════════════════╣
║  SECTION 6: BOTTOM CTA                HEIGHT: 740px  ║
║  BG: white / transparent                             ║
║  LAYOUT: single column, center-aligned               ║
╚══════════════════════════════════════════════════════╝
```

OVERLAPPING sections: none. Sections stack vertically with generous whitespace between them (~80–120px padding top/bottom on most). The nav bar sits in a fixed pill at the top with a secondary teal "Buy now $2.99" bar directly beneath it.

---

## 1.2 — DESIGN TOKENS

```
PALETTE:
  Body Background    "Apple Grey":       #F5F5F7 / rgb(245,245,247)   → page bg, section cards
  True Black         "Nav Black":        #000000 / rgb(0,0,0)         → nav bar, CTA pill bg, app UI elements
  Near Black Text    "Ink":              #050505 / rgb(5,5,5)         → all headlines, body text
  Dark Text          "Charcoal":         #171717 / rgb(23,23,23)      → secondary text
  Medium Grey Text   "Mid":              #6E6E75 / rgb(110,110,117)   → subtitle text, captions
  Light Grey Text    "Muted":            #9898A0 / rgb(152,152,160)   → IPA pronunciation, helper text
  Primary Teal       "Teal":             #07819C / rgb(7,129,156)     → nav buy-bar bg, badge on CTA pill
  Teal Accent        "Cyan":             #00CCCC / rgb(0,204,204)     → app icon gradient, widget accent
  Teal Alt           "Cyan2":            #00CCCD / rgb(0,204,205)     → app icon gradient variant
  A1 Badge Green     "Level-A1":         #008361 / rgb(0,131,97)      → A1 level pill/badge
  Dark Green         "Level-A1-dark":    #0D7D61 / rgb(13,125,97)     → A1 level pill variant
  Dark Navy          "Deep":             #001F1E / rgb(0,31,30)        → deep bg tones in mockup
  App Card Dark      "Card-Dark":        #14141A / rgb(20,20,26)       → dark app screen backgrounds
  Surface Dark       "Surface":          #1D1D1F / rgb(29,29,31)       → app list rows
  Very Dark          "Near-black-2":     #272729 / rgb(39,39,41)       → app row borders
  Mid Dark           "Steel":            #3E3E42 / rgb(62,62,66)       → disabled/secondary dark text
  Border Grey        "Border":           #636367 / rgb(99,99,103)      → subtle borders in app UI
  Subtle Border      "Hairline":         #8D8D92 / rgb(141,141,146)    → hairline borders

TYPOGRAPHY SCALE:
  Role       | Font Family                                              | Weight | Size   | Tracking | Line-Height
  ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  H1 Hero    | -apple-system, SF Pro Display, Helvetica Neue, Arial    | 700    | 32px   | normal   | normal
  H2 Section | -apple-system, SF Pro Text, Helvetica Neue, Arial       | 700    | 24px   | normal   | normal
  Nav Logo   | -apple-system, SF Pro Text, Helvetica Neue, Arial       | 500    | 22px   | normal   | normal
  Nav Items  | -apple-system, SF Pro Text, Helvetica Neue, Arial       | 460    | 22px   | normal   | normal
  Body       | -apple-system, SF Pro Text, Helvetica Neue, Arial       | 400    | 16px   | normal   | ~1.5
  CTA Pill   | -apple-system, SF Pro Text, Helvetica Neue, Arial       | 510    | 15px   | normal   | normal
  Label/IPA  | -apple-system, SF Pro Text, Helvetica Neue, Arial       | 400    | 13-14px| normal   | normal
  ⚑ DRAMA NOTES: The headline "Fluency at glances." uses 32px 700-weight with
    #050505 on white — pure Apple typography hierarchy. No display-size drama; the
    impact comes entirely from whitespace and restraint. Letter-spacing is 0 (default).
    Do not add tracking — the "SF Pro"-style system font at 700 needs NO decoration.

SPACING GRID: Base unit = 8px. Scale: 8, 16, 24, 32, 48, 64, 80, 96, 120+
BORDER RADIUS:
  xs:    8px   — nav menu item hover background
  sm:    12px  — buy-bar pill (nav)
  md:    20px  — large section card containers, phone mockup corners
  full:  999px — primary CTA download pill ("Download for iOS $2.99"), level badges (A1–C2)
SHADOW SYSTEM: minimal — no visible drop shadows on cards. App UI elements inside mockups
               have subtle inner/dark shadows for depth.
TEXTURE: none — completely flat, zero noise or grain.
```

---

## 1.3 — SECTION BLUEPRINTS

### SECTION 0: NAV BAR (sticky fixed top)

Height: ~100px total | BG: black #000 pill + teal buy-bar below | Position: fixed top

```
┌───────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────┐  │
│  │ [Glossar logo]     ≡ [hamburger icon]   │  │  ← Black pill, ~max-w-420px centered
│  └─────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────┐  │
│  │ Buy now              $2.99    [→]       │  │  ← Teal (#07819C) bar, same width as pill
│  └─────────────────────────────────────────┘  │
└───────────────────────────────────────────────┘
```

**TYPOGRAPHY + CONTENT MAP:**

```
  Logo link     → "Glossar"          | 22px / 500 / white
  Hamburger     → ≡ icon (3 lines)   | white lines
  Buy-bar text  → "Buy now"          | 15px / 500 / white | left-aligned
  Buy-bar price → "$2.99"            | 15px / 500 / white | right-aligned
  Buy-bar arrow → [→ arrow icon]     | white circle bg on right end, border-radius 999px
```

Desktop nav reveals: Home, Changelog, Manifesto, Privacy Policy — all 22px weight 460 white

---

### SECTION 1: HERO

Height: 420px | BG: transparent (body #F5F5F7) | Padding: ~80px top

```
┌───────────────────────────────────────────────┐
│                                               │
│          ┌────────┐                           │
│          │ [icon] │   ← App icon, ~60x60px    │
│          └────────┘                           │
│                                               │
│     "Fluency at glances."  ← H1, centered     │
│                                               │
│   "Build your German vocabulary through..."   │
│    ← 2-line body text, centered, #6E6E75      │
│                                               │
│     ┌─────────────────────────┐               │
│     │ Download for iOS │$2.99 │               │
│     └─────────────────────────┘               │
│      ← Black pill, border-radius 999px        │
└───────────────────────────────────────────────┘
```

**COMPOSITION MAP — App Icon:**

- Rounded square (~60px), border-radius ~15px
- Gradient fill: teal/cyan (#00CCCC → #07819C), top-left to bottom-right
- White folded-corner element in bottom-left of icon (page-turn / widget metaphor)
- Slight drop shadow under icon

**TYPOGRAPHY + CONTENT MAP:**

```
  App icon    → [teal gradient square with white fold mark]
  H1          → "Fluency at glances."              | 32px / 700 / #050505 / center
  Body        → "Build your German vocabulary..."   | 16px / 400 / #6E6E75 / center / 2 lines
  CTA         → "Download for iOS" + "$2.99"        | 15px / 510 / white on black pill
                 Left side: "Download for iOS" on #000
                 Right side: "$2.99" on teal #07819C pill inset
                 Full pill: border-radius 999px, padding 6px
```

---

### SECTION 2: FEATURE STORY

Height: 5453px | BG: white/light grey card, large border-radius ~20px | SCROLL-STICKY interior

This is the hero of the page. A large rounded card that contains a sticky phone mockup and progressive scroll-reveal of content. As the user scrolls through 5000px, the phone stays centered while the content below it changes.

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  "Glossar turns the 80 times you look at your        │
│   phone every day into passive learning moments."    │
│   ← ~28-32px headline, centered or near-left         │
│                                                      │
│         ┌─────────────────┐                          │
│         │  iPhone mockup  │  ← sticky while scrolling│
│         │  [home screen]  │  Shows widget/lock screen │
│         │  [app screens]  │  content changing as      │
│         └─────────────────┘  user scrolls             │
│                                                      │
│  "3,800+ words."    (subheadline)                    │
│  "A decade of learning."                             │
│                                                      │
│  [More feature callouts scrolling by]                │
│  "Every word, fully unpacked."                       │
│  "Yours for life."                                   │
└──────────────────────────────────────────────────────┘
```

**Phone mockup progression (scroll-driven):**

1. Lock screen widget: A1 badge + "die Ausstellung / the exhibition" + IPA
2. Home screen: full-bleed illustrated landscape wallpaper (rolling green hills, river valley, German countryside aesthetic, painted/illustrated style)
3. App Library view: word list with level filters (All / A1 / A2 / B1 / B2 / C1 / C2)
4. Word detail screen: dark card showing MEANING, WORD SEPARATION, NOTES sections
5. Settings/customize screen: Refresh Rate, Difficulty Level controls

**Typography + Content Map:**

```
  Opening H2  → "Glossar turns the 80 times you look at your phone..."  | ~28px / 700 / #050505
  Subhead 1   → "3,800+ words."                                          | ~24px / 700 / #050505
  Subhead 2   → "A decade of learning."                                  | ~20px / 400 / #6E6E75
  Subhead 3   → "Every word, fully unpacked."                            | ~20px / 400 / #050505
  Subhead 4   → "Yours for life."                                        | ~20px / 400 / #6E6E75 italic feel
  Widget text → "A1 / die Ausstellung / the exhibition / /ˈaʊ̯sˌʃtɛlʊŋ/" | in-mockup, small
```

---

### SECTION 3: LEVELS

Height: 860px | BG: white | Padding: ~80px top, ~80px bottom

```
┌──────────────────────────────────────────────────┐
│                                                  │
│  "Curated to expand your vocabulary."            │
│  "From foundational A1 basics to complex C2..."  │
│   ← left-aligned text block                      │
│                                                  │
│  [A1] [A2] [B1] [B2] [C1] [C2]                  │
│   ← colored pill badges, row, left-aligned        │
│                                                  │
│         ┌──────────────────────┐                 │
│         │  "Every word,        │                 │
│         │   fully unpacked."   │                 │
│         │  [App word detail    │                 │
│         │   screenshot]        │                 │
│         └──────────────────────┘                 │
└──────────────────────────────────────────────────┘
```

**Level Pill Colors:**

```
  A1: #008361 (dark green)
  A2: #0070C9 (blue, approx)
  B1: #6E3FC9 (purple, approx)
  B2: #C93F8D (pink/magenta, approx)
  C1: #C93F3F (red, approx)
  C2: #C97A3F (orange, approx)
  All pills: border-radius 999px, white text, ~40-44px height, ~60-80px wide
```

---

### SECTION 4: SHOWCASE

Height: 1333px | BG: light grey card (#F5F5F7), border-radius ~20px

```
┌──────────────────────────────────────────────────┐
│                                                  │
│  "Seamless fluency."  ← large headline           │
│                                                  │
│      ┌─────────────────┐                         │
│      │ iPhone: Library │ ← dark app UI            │
│      │ screen with     │   word list             │
│      │ level filter    │   tabs at top           │
│      └─────────────────┘                         │
│                                                  │
│  "Truly yours."                                  │
│  "Revisit your words and customize..."           │
│                                                  │
│      [Settings screen mockup]                    │
└──────────────────────────────────────────────────┘
```

**Typography + Content Map:**

```
  H2          → "Seamless fluency."          | ~28px / 700 / #050505
  Subhead     → "Truly yours."               | ~22px / 700 / #050505
  Body        → "Revisit your words and..."  | 16px / 400 / #6E6E75
```

---

### SECTION 5: VOCABULARY CARDS

Height: 940px | BG: light grey card (#F5F5F7), border-radius ~20px

```
┌────────────────────────────────────────────────────┐
│                                                    │
│  "The perfect companion to your active study."     │
│  "A quick way to keep new vocabulary fresh         │
│   between sessions."                               │
│                                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │ [A1]         │ │ [A2]         │ │ [B1]       │ │
│  │ bestellen    │ │ das Fernweh  │ │ der        │ │
│  │ to order     │ │ wanderlust   │ │ Ratschlag  │ │
│  │ /bəˈʃtɛlən/ │ │ /ˈfɛʁnveː/  │ │ the advice │ │
│  └──────────────┘ └──────────────┘ └────────────┘ │
│   ← 3-col grid of dark vocabulary cards            │
└────────────────────────────────────────────────────┘
```

**Vocabulary Card Design:**

- Background: dark #1D1D1F (near-black)
- Border-radius: ~16px
- Level badge: colored circle (green/blue/purple) with level code (A1/A2/B1), top-left
- German word: 20-22px, weight 700, white
- English translation: 14-16px, weight 400, #9898A0 (muted grey)
- IPA pronunciation: 13px, weight 400, #8D8D92, bottom of card

---

### SECTION 6: BOTTOM CTA

Height: 740px | BG: white/transparent | Padding: ~100px top/bottom

```
┌──────────────────────────────────────────────────┐
│                                                  │
│          ┌────────┐                              │
│          │ [icon] │  ← same app icon as hero     │
│          └────────┘                              │
│                                                  │
│     "See? You just learned a word.               │
│      Imagine a year."                            │
│      ← centered, ~28-32px, weight 700            │
│                                                  │
│     ┌─────────────────────────┐                  │
│     │ Download for iOS │$2.99 │                  │
│     └─────────────────────────┘                  │
└──────────────────────────────────────────────────┘
```

---

## 1.3b — COMPOSITION MAPS

### COMPOSITION MAP: Hero App Icon

Element count: 2 distinct visual objects

```
CENTER:    Rounded square icon, ~60x60px, border-radius ~15px
           Gradient: teal #00CCCC → cyan #07819C, top-left to bottom-right diagonal

ABOVE:     White folded-corner/page-curl element in bottom-left corner of icon
           Represents a widget card or sticky note motif
           Color: white, partial opacity

AMBIENT:   Subtle drop shadow beneath icon: rgba(0,0,0,0.12) 0 4px 12px
```

### COMPOSITION MAP: Feature Story Phone Mockup

Element count: 5 visual layers in the phone

```
CENTER:    iPhone mockup frame, ~300-360px wide, ~580-620px tall
           Dark bezel, notch/island at top, centered on page

SCREEN 1 (scroll pos 0-30%):
  Lock screen with:
  - Full-bleed illustrated wallpaper (German valley, painted style, warm green/blue)
  - Widget overlay: dark rounded card, A1 green badge, German word + translation + IPA
  - Time "10:30" in white at top
  - Status bar icons (signal, wifi, battery)

SCREEN 2 (scroll pos 30-60%):
  Same wallpaper + home screen dock (4 apps: Phone/Safari/Messages/Music)
  Widget still visible, slight position change

SCREEN 3 (scroll pos 60-80%):
  App Library: dark #14141A bg
  Level filter tabs (All A1 A2 B1 B2 C1 C2) at top
  Word list: German word / English translation rows in light separator rows
  Progress indicator: "1% Discovered"

SCREEN 4 (scroll pos 80-95%):
  Word detail: dark card with MEANING, WORD SEPARATION, NOTES sections
  Tab bar at bottom: Home / Library / Settings icons

AMBIENT:  Blue sky / cloud background visible behind phone on left side (partial)
          Creates depth — phone floats in front of blurred nature scene
```

---

## 1.4 — ANIMATION TIMELINES

```
ANIMATION: Hero Entrance
Section: Hero
Trigger: page-load
Library: CSS (class `heroSettled` applied after load)
TIMELINE:
  t=0ms     Page loads, hero has initial state (slight opacity/transform offset)
  t=~200ms  Hero elements fade to full opacity, translateY(0)
  t=~400ms  CTA pill visible
PROPERTIES ANIMATED: opacity, transform (translateY)
LOOP: no
RESET: n/a

ANIMATION: Feature Story Scroll-Driven Phone Content
Section: Feature Story
Trigger: scroll position (Lenis smooth scroll)
Library: CSS scroll + Lenis
TIMELINE: As user scrolls 0→5453px, phone screen content transitions
  Each ~700-1000px of scroll: new screen state fades in
PROPERTIES ANIMATED: opacity (screen layers fade in/out)
LOOP: no
RESET: yes on scroll-back

ANIMATION: Section Entrance Fade
Section: All content sections
Trigger: scroll-enter (~80vh from top)
Library: CSS (likely IntersectionObserver + class toggle)
TIMELINE:
  FROM: opacity:0, translateY(20-30px)
  TO:   opacity:1, translateY(0), duration ~600ms, ease-out
LOOP: no
RESET: no (stays revealed)
```

---

## 1.5 — MICRO-INTERACTIONS

```
INTERACTION: Primary CTA Pill ("Download for iOS $2.99")
Selector hint: .downloadPill
STATE     | background  | color  | transform   | other
──────────────────────────────────────────────────────
DEFAULT   | #000000     | #fff   | scale(1)    | border-radius: 999px
HOVER     | #171717     | #fff   | scale(1.02) | slight brightness increase
ACTIVE    | #000000     | #fff   | scale(0.97) | –
MECHANISM: CSS transition on background + transform
DURATION: ~150ms  EASING: ease-out
⚑ SPECIAL BEHAVIOR: The pill has TWO visual zones — left "Download for iOS" black
  area + right "$2.99" inset teal pill. The entire pill is one <a> tag.

INTERACTION: Nav Menu Items
Selector hint: .menuItem
STATE     | background          | color  | border-radius
─────────────────────────────────────────────────────────
DEFAULT   | transparent         | white  | 8px
HOVER     | rgba(255,255,255,0.1)| white  | 8px
ACTIVE    | rgba(255,255,255,0.18)| white | 8px
MECHANISM: CSS transition on background-color
DURATION: ~120ms
```

---

## 1.6 — STATE MACHINES

```
STATE MACHINE: Feature Story Phone Screen
Location: Section 2 (Feature Story)
Type: Scroll-driven Sequence
STATES:
  State A: Lock screen with widget (word visible, illustrated wallpaper behind)
  State B: Home screen (widget + app dock visible, wallpaper)
  State C: App Library screen (word list, dark UI)
  State D: Word detail screen (MEANING / WORD SEPARATION / NOTES)
  State E: Settings screen (Refresh Rate, Difficulty Level)
INITIAL STATE: A
TRANSITION A→B: scroll ~700px, screen content crossfades
TRANSITION B→C: scroll ~700px more, app UI appears
TRANSITION C→D: scroll ~700px more, word detail visible
TRANSITION D→E: scroll ~700px more, settings shown
LOOP: no — linear scroll sequence
```

---

## 1.7 — SCROLL CHOREOGRAPHY MAP

```
Scroll %  │ Approx px    │ Event
──────────────────────────────────────────────────────────────
0%        │ 0px          │ Hero with nav visible. Lenis smooth scroll active.
4%        │ ~420px       │ Feature Story section begins. Phone mockup enters.
10%       │ ~1000px      │ Phone shows lock screen widget. Opening headline fades in.
20%       │ ~2000px      │ Phone transitions to home screen state.
30%       │ ~3000px      │ "3,800+ words. A decade of learning." reveals.
45%       │ ~4500px      │ Phone shows app Library screen.
55%       │ ~5500px      │ Word detail screen. Levels section enters viewport.
65%       │ ~6500px      │ Levels section: A1–C2 pill badges fade in.
72%       │ ~7200px      │ Showcase section: Library screen, "Seamless fluency."
85%       │ ~8500px      │ Vocabulary cards section: 3-col cards appear.
95%       │ ~9500px      │ Bottom CTA: "See? You just learned a word."
──────────────────────────────────────────────────────────────
SCROLL BEHAVIORS:
  Parallax elements: Phone mockup in Feature Story is sticky (position:sticky)
                     while surrounding content scrolls past it.
  Sticky elements: Phone mockup in Feature Story section — sticks to viewport
                   center as ~5000px of content scrolls beneath it.
  Nav state change: Nav bar is fixed at all times — no morphing on scroll.
  Smooth scroll: Lenis is active — all scroll is eased with momentum feel.
```

---

## 1.8 — TECHNICAL STACK

```
  Framework: Next.js (confirmed — /_next/static/chunks/ scripts, Turbopack build)
  Animation: CSS only — IntersectionObserver + class toggles for entrance animations.
             No GSAP, no Framer Motion detected.
  Scroll:    Lenis (confirmed) — smooth scroll momentum
  UI Lib:    CSS Modules (class naming: page-module__[hash]__[className])
  Other:     None detected. Very lean dependency tree.
```

---

## 1.9 — MOTION PHILOSOPHY + COPY VOICE

```
MOTION PHILOSOPHY:
The motion is Apple-calibrated restraint — nothing moves that doesn't need to.
Entrance animations are gentle fade+rise (20-30px translateY, ~600ms ease-out),
never showy. The headline experience is the scroll-driven phone mockup in Section 2:
5000px of scroll reveals a single device progressing through 5 app states, which
produces a cinematic "product tour" feeling without any animation library complexity.
Lenis smooth scroll is the single biggest quality multiplier — everything feels
physically weighted. If you removed all animations, the page would be 90% identical;
the motion exists to polish, not to dazzle.

COPY VOICE PATTERN:
  Tone:           Warm, confident, understated. Never hype. Never features-list.
  Sentence form:  Mix of poetic fragments and short declarative sentences.
                  Fragments dominate headlines. Full sentences for body.
  Key device:     Earned specificity + emotional payoff.
                  "80 times you look at your phone" → specific, believable
                  "See? You just learned a word. Imagine a year." → the payoff
  Example patterns:
    "[Specific number] into [reframed benefit]"
      → "Glossar turns the 80 times you look at your phone every day
         into passive learning moments."
    "[Two-word noun phrase]. [Short qualifier sentence]."
      → "Fluency at glances."
      → "Seamless fluency."
      → "Yours for life."
    "[Conversational observation]. [Scale invitation]."
      → "See? You just learned a word. Imagine a year."
```
