---
name: TFHC Orderliness
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45464d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#904d00'
  on-secondary: '#ffffff'
  secondary-container: '#fe932c'
  on-secondary-container: '#663500'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002113'
  on-tertiary-container: '#009668'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#ffdcc3'
  secondary-fixed-dim: '#ffb77d'
  on-secondary-fixed: '#2f1500'
  on-secondary-fixed-variant: '#6e3900'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  edge-margin: 16px
  gutter: 12px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
  section-gap: 32px
---

## Brand & Style
The design system is rooted in the philosophy of "Sanctified Order"—a blend of modern professionalism and spiritual reverence. The target audience includes community members and leaders who value punctuality, stewardship, and clarity. 

The visual style is **Minimalist-Modern** with a focus on high-contrast utility. It avoids unnecessary ornamentation, favoring whitespace and structured hierarchy to evoke an emotional response of peace, reliability, and communal accountability. The interface should feel like a premium digital companion that honors the user's time and commitment.

## Colors
The palette is dominated by **Deep Navy**, representing stability and authority, balanced by **Regal Gold** for moments of action and spiritual significance. 

- **Primary (#0F172A):** Used for text, primary buttons, and heavy branding elements.
- **Secondary (#D97706):** Reserved for high-priority interactive elements like the central Check-In trigger and active states.
- **Success & Warning:** Used sparingly to indicate status (e.g., "On Time" vs "Grace Period").
- **Surface Strategy:** Use the Off-White background to differentiate the screen from the Pure White card containers, creating a subtle layered effect without heavy shadows.

## Typography
This design system utilizes **Inter** exclusively to ensure maximum legibility and a clean, systematic feel across mobile devices. 

- **Headlines:** Use Bold and Semi-Bold weights with slight negative letter-spacing to create a confident, grounded look.
- **Body Text:** Stick to 16px (Base) for primary reading to ensure accessibility for all age groups in the community.
- **Labels:** Use uppercase for small labels and badges to provide a "metadata" feel that contrasts against standard body text.

## Layout & Spacing
The layout follows a **Fluid Grid** model with strict safe-area margins. 

- **Margins:** A standard 16px padding is applied to the horizontal edges of all screens.
- **Stacking:** Use 16px (stack-md) as the default vertical rhythm between related components.
- **Mobile Adaptation:** Content should primarily use single-column card layouts. For the Leaderboard or Meeting lists, use a standard 12px gutter between internal card elements.
- **Safe Areas:** Ensure the Bottom Navigation Bar respects the device's home indicator region, adding extra bottom padding where necessary.

## Elevation & Depth
Depth is conveyed through **Tonal Layers** and a specific **Soft Shadow** signature. 

- **Base Layer:** Off-White (#F8FAFC) serves as the "ground" for the app.
- **Card Layer:** Pure White (#FFFFFF) cards sit on top of the base.
- **Shadows:** Use a single, consistent shadow for cards: `0px 2px 8px rgba(0, 0, 0, 0.05)`. This creates a subtle lift that feels light and approachable rather than heavy.
- **Special Elevation:** The central "Check-In" action in the navigation bar uses a slightly more aggressive shadow or a glow effect in the secondary color to signify its importance as the primary utility.

## Shapes
The shape language is **Rounded**, leaning towards friendly but structured.

- **Standard Containers:** Use `rounded-md` (0.5rem / 8px) for cards and input fields.
- **Buttons:** Apply `rounded-md` for standard buttons.
- **Badges/Pills:** Use `rounded-xl` (1.5rem / 24px) or full pill shapes for status indicators (e.g., "On Time").
- **Check-In Icon:** The central QR trigger in the navigation bar is a perfect circle (pill-shaped max) to differentiate it from standard navigation icons.

## Components

### Buttons
- **Primary:** Deep Navy background, White text, Semi-bold. High contrast is mandatory.
- **Secondary:** Transparent background with a 1px Navy border or a light Slate 100 fill for lower priority.
- **Check-In FAB:** A circular Gold button positioned in the center of the bottom nav, featuring a white QR icon.

### Cards
- Pure white background with the specified 5% opacity shadow.
- Headers should use `headline-sm` in Deep Navy.
- Content padding should be a consistent 16px.

### Input Fields
- 1px border in `Border Gray`. 
- Leading icons in `Slate 500`. 
- Focused state should use a 2px `Deep Navy` or `Gold` border.

### Badges & Chips
- Status indicators (Success, Warning, Destructive) should use a light tint of the color for the background and the full-saturation color for the text (e.g., Light Emerald background with Dark Emerald text).
- Always use a 12px font size with semi-bold weight.

### Bottom Navigation
- **Active State:** Icons and labels transition to Deep Navy (or Gold for the center item).
- **Inactive State:** Icons and labels use Slate 500.
- **Structure:** 5 equal segments, with the center segment visually elevated or uniquely styled to emphasize the QR action.

### Lists
- Use horizontal dividers (#E2E8F0) between list items in a view, or individual cards if items represent distinct objects like "Meetings."