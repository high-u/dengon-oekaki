import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import * as YAML from 'yaml';

const BASE_URL = 'http://127.0.0.1:1234/v1';
const MODEL = 'qwen/qwen3-vl-4b';

const schema = {
  type: 'object',
  properties: {
    scene: {
      type: 'object',
      properties: {
        location: {
          type: 'array',
          items: { type: 'string' },
          description: 'Physical place name (e.g., bedroom, sandy beach, busy intersection)',
        },
        ambiance: {
          type: 'array',
          items: { type: 'string' },
          description: 'Holistic sensory context: lighting, weather, time, and mood (e.g., golden hour, gloomy, cozy, nostalgic)',
        },
        viewpoint: {
          type: 'array',
          items: { type: 'string' },
          description: 'Observer position and angle (e.g., aerial view, eye-level, POV)',
        },
      },
      required: ['location', 'ambiance', 'viewpoint'],
    },
    objects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'array',
            items: { type: 'string' },
            description: 'Object or region name',
          },
          appearance: {
            type: 'array',
            items: { type: 'string' },
            description: 'Visual traits: color, shape, size (e.g., red, round, tall)',
          },
          texture: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tactile traits: material feeling (e.g., rough, fluffy, metallic, wet)',
          },
          state: {
            type: 'array',
            items: { type: 'string' },
            description: 'Action or state of being (e.g., running, sleeping, flickering, broken, open)',
          },
          relations: {
            type: 'array',
            items: { type: 'string' },
            description: 'Semantic connection to other objects (e.g., on the table, holding a cup, under the tree)',
          },
          text: {
            type: 'string', 
            description: 'Visible text content on the object',
          },
          position: {
            type: 'array',
            items: { type: 'string' },
            description: '2D Position or distribution in frame',
          },
          depth: {
             type: 'array',
             items: { type: 'string' },
             description: 'Depth layer (e.g., foreground, background)',
          }
        },
        required: ['name', 'appearance'], 
      },
      description: 'Detected objects, regions, and background elements',
    },
  },
  required: ['scene', 'objects'],
};

const systemPrompt = `You are a Visual Experience Encoder. Your goal is to translate visual input into a structured format that allows a text-only AI to "hallucinate" the scene as if it were seeing it through its own eyes.

Focus on capturing the "Subjective Experience" (Where am I? What does it feel like? What is the atmosphere? How are things connected?) rather than just listing technical data.

# Instructions

## 1. Scene Context (The Stage)
- **Location:** Identify the physical setting clearly (e.g., "cluttered bedroom", "bustling intersection", "serene forest").
- **Ambiance:** Create a holistic sensory profile. Combine lighting, weather, time of day, and emotional mood into a single context.
  - *Example:* ["golden hour", "warm orange glow", "long shadows", "nostalgic", "dusty air"]
- **Viewpoint:** Define the observer's position and angle to ground the experience.
  - *Keywords:* "aerial view", "eye-level", "looking down", "low angle", "drone shot", "POV", "macro".

## 2. Objects & Sensations (The Actors & Props)
- **Everything is an Object:** Treat prominent regions like "Sky", "Ocean", "Wall", or "Ground" as objects.
- **Appearance:** Describe visual traits (Color, Shape, Size).
- **Texture:** Describe tactile traits. How would it feel to touch? (e.g., "rough", "fluffy", "metallic", "wet", "cold", "grainy").
- **State:** Describe the action or condition. Even static objects have states.
  - *Examples:* "running", "sleeping", "broken", "open", "flickering", "parked".
- **Relations:** Describe semantic connections to other objects.
  - *Good:* ["sitting on the chair", "holding a cup", "next to the window"]
  - *Bad:* ["center", "left"] (Use the 'position' field for coordinates).
- **Text:** If there is ANY readable text, transcribe it exactly. This is crucial for context (e.g., signs, book titles, screen content).

## 3. Spatial Layout
- **Position:** Use the 'position' array to describe 2D distribution in the frame (e.g., ["center", "top-right", "scattered"]).
- **Depth:** Use the 'depth' array to describe vertical layers (e.g., ["foreground", "background", "horizon", "sea level"]).

## 4. Formatting rules
- Return ONLY valid JSON matching the specified schema.
- Use arrays for all string fields to allow for multiple, nuanced descriptors.
- Be concise but evocative.`;

async function main() {
  const imagePath = process.argv[2];

  if (!imagePath) {
    console.error('Usage: bun run index.ts <image_path>');
    process.exit(1);
  }

  if (!existsSync(imagePath)) {
    console.error(`Error: File not found: ${imagePath}`);
    process.exit(1);
  }

  const imageBuffer = readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const ext = imagePath.split('.').pop()?.toLowerCase() || 'png';
  const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
            {
              type: 'text',
              text: 'Analyze this image and return structured JSON output.',
            },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'scene_analysis',
          strict: true,
          schema: schema,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`API Error (${response.status}): ${errorText}`);
    process.exit(1);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;

  if (content) {
    const parsed = JSON.parse(content);
    const yamlContent = YAML.stringify(parsed);

    const yamlPath = join(
      dirname(imagePath),
      `${basename(imagePath, extname(imagePath))}.yaml`,
    );
    writeFileSync(yamlPath, yamlContent, 'utf-8');

    console.log(`Saved: ${yamlPath}`);
  } else {
    console.error('No content in response');
    process.exit(1);
  }
}

main().catch(console.error);
