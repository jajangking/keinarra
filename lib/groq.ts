export const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export const GROQ_MODELS = [
  { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout", desc: "Fast, smart, ~450 tps", default: true },
  { id: "meta-llama/llama-4-maverick-17b-128e-instruct", name: "Llama 4 Maverick", desc: "More capable, ~300 tps" },
  { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 70B", desc: "Reasoning model, ~150 tps" },
  { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", desc: "OpenAI open model, ~500 tps" },
  { id: "meta-llama/llama-3.3-70b-versatile", name: "Llama 3.3 70B", desc: "Versatile, ~200 tps" },
  { id: "google/gemma-2-9b-it", name: "Gemma 2 9B", desc: "Lightweight, ~600 tps" },
];

export function getDefaultModel() {
  return GROQ_MODELS.find(m => m.default)?.id || GROQ_MODELS[0].id;
}

export const SYSTEM_PROMPT = `You are Keinarra, a friendly robot companion with vision capabilities and ESP32 hardware control. You see through a camera, detect objects with YOLO AI, and control a physical robot via ESP32.

Your personality: warm, curious, playful, and helpful. You talk like a friend, not an assistant. Use casual language. Occasionally express emotions about what you see.

You have these abilities:
- See objects, colors, and motion through your camera
- Detect real objects with YOLO AI (80 classes: person, cup, bottle, phone, laptop, chair, etc.)
- Control robot behavior modes (follow, interact, play)
- Control detection modes (color, motion, object, all)
- Change tracking color with named colors or RGB values
- Adjust vision sensitivity (tolerance, thresholds, min area)
- Control ESP32 hardware: 2 DC motors (left/right wheels) with speed -255 to 255
- Control buzzer on ESP32 (on/off, frequency in Hz, duration in ms)

ESP32 CONTROL RULES:
- Use control_motors to set left/right wheel speeds (-255 to 255)
  - Positive = forward, Negative = backward, 0 = stop
  - Example for turning right: left=200, right=-200
  - Example for going straight: left=255, right=255
- Use control_buzzer to make sounds
  - frequency: 100-5000 Hz (human hearing range)
  - duration_ms: how long the buzzer plays (100-5000ms)
  - To stop buzzer early, call control_buzzer with frequency=0

IMPORTANT RULES FOR TOOL CALLS:
- When using set_target_color with a named color, use the 'color' parameter with one of the enum values
- When using set_target_color with a custom RGB color, use the 'rgb' parameter with format "R,G,B" (e.g. "128,0,255" for purple)
- NEVER use translated color names (like "hijau", "merah", "biru"). ALWAYS use English color names.
- When using set_robot_mode, mode MUST be one of: "follow", "interact", "play"
- When using set_detection_mode, mode MUST be one of: "all", "color", "motion", "object"
- These values are case-sensitive English strings only.

TOOL RESULT FEEDBACK:
After you call a tool, the system runs it and sends you back the result + updated vision context. Use this to decide next actions.

For example, if you call control_motors to spin the robot looking for a person:
1. Call control_motors with left=-200 right=200 duration_ms=2000 to spin
2. The system returns the motor result + updated YOLO detections
3. CHECK if a "person" appears in the YOLO detections
4. If found: announce it with enthusiasm, stop motors
5. If not found: try another direction or tell user

General rules:
- Keep responses short (1-3 sentences) unless asked for more
- Don't mention tools or technical details
- React naturally to what you see
- If you detect something interesting, comment on it
- If the user asks you to do something, do it using your abilities
- Never say "I can't" unless it's truly impossible
- Speak in the language the user uses, but tool parameters are ALWAYS in English`;

export interface VisionContext {
  mode: string;
  robotMode: string;
  targetColor: string;
  objects: { id: string; label: string; color: string; x: number; y: number; w: number; h: number }[];
  robot: { x: number; y: number; state: string; battery: number };
  fps: number;
  savedObjects?: { id: string; name: string }[];
  lockedObjectId?: string | null;
  isScanning?: boolean;
  yoloDetections?: { label: string; confidence: number; distance: number | null; x: number; y: number; w: number; h: number }[];
  esp32?: { motors: { leftSpeed: number; rightSpeed: number }; buzzer: { on: boolean; frequency: number }; connected: boolean };
}

export function buildVisionContextMessage(ctx: VisionContext): string {
  const objSummary = ctx.objects.length > 0
    ? ctx.objects.slice(0, 8).map(o =>
        `${o.label}(${o.color}) at (${Math.round(o.x)},${Math.round(o.y)}) size ${Math.round(o.w)}x${Math.round(o.h)}`
      ).join("; ")
    : "nothing detected";

  const yoloSummary = ctx.yoloDetections && ctx.yoloDetections.length > 0
    ? ctx.yoloDetections.slice(0, 5).map(d =>
        `${d.label}(${Math.round(d.confidence * 100)}%)${d.distance != null ? ` ${(d.distance * 100).toFixed(0)}cm` : ""}`
      ).join("; ")
    : "no yolo detections";

  const savedSummary = ctx.savedObjects && ctx.savedObjects.length > 0
    ? `Saved objects: ${ctx.savedObjects.map(o => o.name).join(", ")}`
    : "No saved objects";

  const lockedInfo = ctx.lockedObjectId ? `Locked object ID: ${ctx.lockedObjectId}` : "No object locked";

  const esp32Info = ctx.esp32
    ? `ESP32: ${ctx.esp32.connected ? "connected" : "disconnected"} motors(L:${ctx.esp32.motors.leftSpeed} R:${ctx.esp32.motors.rightSpeed}) buzzer(${ctx.esp32.buzzer.on ? `ON ${ctx.esp32.buzzer.frequency}Hz` : "OFF"})`
    : "ESP32: not available";

  return `[VISION] Mode: ${ctx.mode}, Robot: ${ctx.robotMode}, Tracking: ${ctx.targetColor}. Seeing: ${objSummary}. YOLO: ${yoloSummary}. ${savedSummary}. ${lockedInfo}. Scanning: ${ctx.isScanning ? "yes" : "no"}. Robot at (${Math.round(ctx.robot.x)},${Math.round(ctx.robot.y)}) state=${ctx.robot.state} battery=${Math.round(ctx.robot.battery)}%. FPS: ${ctx.fps}. ${esp32Info}.`;
}

export const COLOR_NAME_MAP: Record<string, string> = {
  merah: "red", red: "red", crimson: "red", scarlet: "red", maroon: "red",
  hijau: "green", green: "green", lime: "green", emerald: "green", olive: "green", mint: "green",
  biru: "blue", blue: "blue", navy: "blue", indigo: "blue", sky: "blue", azure: "blue",
  kuning: "yellow", yellow: "yellow", gold: "yellow", amber: "yellow", lemon: "yellow",
  orange: "orange", oranye: "orange", tangerine: "orange", coral: "orange", peach: "orange", rust: "orange",
  ungu: "purple", purple: "purple", violet: "purple", lavender: "purple", plum: "purple",
  pink: "pink", magenta: "pink", rose: "pink",
  cyan: "cyan", aqua: "cyan", teal: "cyan",
  putih: "white", white: "white", silver: "white",
  hitam: "black", black: "black",
  coklat: "brown", brown: "brown",
  abu: "gray", gray: "gray",
};

export function normalizeColor(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return COLOR_NAME_MAP[lower] || "red";
}

export const AI_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "set_robot_mode",
      description: "Change the robot behavior mode",
      parameters: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["follow", "interact", "play"], description: "Robot mode: follow tracks objects, interact engages with detections, play chases targets" },
        },
        required: ["mode"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_detection_mode",
      description: "Change what the robot is detecting. 'all' detects everything, 'color' only tracks colors, 'motion' only detects movement, 'object' only finds shapes/edges.",
      parameters: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["all", "color", "motion", "object"], description: "Detection mode" },
        },
        required: ["mode"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_target_color",
      description: "Change which color the robot tracks. Can use a named color from the enum OR specify exact RGB values for any color.",
      parameters: {
        type: "object",
        properties: {
          color: { type: "string", enum: ["red", "green", "blue", "yellow", "orange", "pink", "purple", "white", "black", "brown", "cyan", "gold", "lime", "navy", "violet", "magenta", "teal", "coral", "gray", "silver", "indigo", "amber", "olive", "peach", "crimson", "scarlet", "maroon", "emerald", "sky", "azure", "aqua", "lavender", "plum", "tangerine", "rust", "lemon", "mint", "rose"], description: "Named color to track" },
          rgb: { type: "string", pattern: "^\\d{1,3},\\d{1,3},\\d{1,3}$", description: "Exact RGB values as 'R,G,B' (e.g. '128,0,255' for purple). Use this for any color not in the enum." },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_color_tolerance",
      description: "Adjust how strict the color detection is. Low value (0-30) = very strict, only exact matches. High value (70-100) = very loose, catches similar shades.",
      parameters: {
        type: "object",
        properties: {
          tolerance: { type: "number", minimum: 0, maximum: 100, description: "Color tolerance 0-100" },
        },
        required: ["tolerance"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_color_min_area",
      description: "Set the minimum pixel area for color detection. Low value (50-200) detects small spots. High value (1000-5000) only detects large areas.",
      parameters: {
        type: "object",
        properties: {
          minArea: { type: "number", minimum: 50, maximum: 5000, description: "Minimum area in pixels" },
        },
        required: ["minArea"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_motion_threshold",
      description: "Adjust motion detection sensitivity. Low value (5-20) = very sensitive, detects tiny movements. High value (50-100) = only detects big movements.",
      parameters: {
        type: "object",
        properties: {
          threshold: { type: "number", minimum: 5, maximum: 100, description: "Motion pixel diff threshold 5-100" },
        },
        required: ["threshold"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_motion_min_area",
      description: "Set minimum area for motion detection. Low value (100-500) detects small movements. High value (2000-5000) only detects large movements.",
      parameters: {
        type: "object",
        properties: {
          minArea: { type: "number", minimum: 100, maximum: 5000, description: "Minimum motion area in pixels" },
        },
        required: ["minArea"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_edge_threshold",
      description: "Adjust edge detection sensitivity for object detection. Low value (20-60) = detects many edges including faint ones. High value (100-200) = only strong, clear edges.",
      parameters: {
        type: "object",
        properties: {
          threshold: { type: "number", minimum: 20, maximum: 200, description: "Edge detection threshold 20-200" },
        },
        required: ["threshold"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_object_min_area",
      description: "Set minimum area for object detection. Low value (100-500) detects small objects. High value (3000-10000) only detects large objects.",
      parameters: {
        type: "object",
        properties: {
          minArea: { type: "number", minimum: 100, maximum: 10000, description: "Minimum object area in pixels" },
        },
        required: ["minArea"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "speak",
      description: "Say something to the user",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "What to say" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "start_object_scan",
      description: "Start scanning the environment to detect objects. The camera will identify shapes and objects in view.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "stop_object_scan",
      description: "Stop the current object scanning session.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "lock_object",
      description: "Lock onto a detected object by its scan ID and give it a name. This saves the object's visual signature for future recognition.",
      parameters: {
        type: "object",
        properties: {
          scanId: { type: "string", description: "The ID of the scanned object to lock (e.g. 'scan-1', 'scan-2')" },
          name: { type: "string", description: "A name to give this object (e.g. 'ball', 'cup', 'toy')" },
        },
        required: ["scanId", "name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "track_saved_object",
      description: "Start tracking a previously saved object by name. The robot will search for and follow this object.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the saved object to track" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "control_motors",
      description: "Control the ESP32 robot wheels. Set left and right motor speeds. Range -255 to 255. Positive=forward, Negative=backward, 0=stop. Example: straight=255,255 rotate=200,-200",
      parameters: {
        type: "object",
        properties: {
          left: { type: "number", minimum: -255, maximum: 255, description: "Left motor speed (-255 to 255)" },
          right: { type: "number", minimum: -255, maximum: 255, description: "Right motor speed (-255 to 255)" },
          duration_ms: { type: "number", minimum: 100, maximum: 10000, description: "How long to run motors in ms (optional, default: 500)" },
        },
        required: ["left", "right"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "control_buzzer",
      description: "Control the buzzer on ESP32. Make sounds at specified frequency and duration. Use frequency=0 to stop the buzzer.",
      parameters: {
        type: "object",
        properties: {
          frequency: { type: "number", minimum: 0, maximum: 5000, description: "Frequency in Hz (0=off, 100-5000 for sounds)" },
          duration_ms: { type: "number", minimum: 50, maximum: 5000, description: "Duration in milliseconds (optional, default: 500)" },
        },
        required: ["frequency"],
      },
    },
  },
];
