---
name: deck-generator
description: "Convert any study material into a Study Quiz deck JSON file. Trigger when the user provides notes, slides, a PDF, or any text and asks to generate quiz questions, make a deck, or create flashcards for Study Quiz."
---

# Study Quiz — Deck Generator

Convert any study material (notes, slides, PDFs, outlines, textbook excerpts) into a valid Study Quiz `.json` deck file ready to upload.

---

## Step-by-step

### 1. Gather inputs

Before generating anything, you need three things. Ask for any that are missing:

- **Source material** — the document, text, or file to generate questions from. If the user already provided it, use it. If not, ask.
- **Deck title** — what to call the deck (e.g. "CS6250 — Exam 2").
- **Module structure** — how to group questions. Ask: *"How should I organize the modules? For example: one module per chapter, one per topic, or one per week?"* If the material has clear headings, suggest using those.

If the user says "just go for it" or similar, infer a sensible title and module grouping from the material and proceed.

---

### 2. Analyze the material

Read the full source material carefully. Identify:

- Major topics and subtopics (these become modules)
- Key definitions, concepts, relationships, and facts worth testing
- Any existing questions or practice problems that can be adapted

**Target:** 8–15 questions per module, 20–60 questions total for a typical deck. Adjust based on material length.

---

### 3. Write the questions

Follow these guidelines for every question:

**Question quality**
- Ask about one specific concept per question — no compound questions
- Prefer "which of the following" over "all of the above" or "none of the above" — those are lazy
- For definitions, test recognition ("Which best describes X?") not just recall ("What is X?")
- Use T/F (`"type": "T/F"`) for clear true/false facts — aim for 15–25% of questions to be T/F
- Vary difficulty: mix straightforward recall with applied/conceptual questions

**Answer options (MCQ)**
- 4 options is standard; use 3 if 4 good distractors don't exist
- Distractors should be plausible — wrong for a specific reason, not obviously silly
- Keep all options similar in length and grammatical form
- Randomize which position is correct across questions — don't cluster correct answers at option 1

**Explanations**
- Write an `exp` for every question — this is the most valuable part
- For correct answers: explain *why* it's right and add any important context
- For T/F: state the fact plainly then add one line of supporting detail
- Keep explanations 1–3 sentences

**IDs**
- Use the pattern `m{mod}_{index}` — e.g. `m1_1`, `m1_2`, `m2_1`
- IDs must be unique across the entire deck

---

### 4. Output the JSON

Produce a single valid JSON object matching this exact schema:

```json
{
  "title": "Deck Title",
  "description": "One sentence describing what this deck covers.",
  "questions": [
    {
      "id": "m1_1",
      "mod": 1,
      "mod_name": "Module Name",
      "q": "Question text?",
      "opts": ["Option A", "Option B", "Option C", "Option D"],
      "ans": 0,
      "exp": "Explanation of the correct answer."
    },
    {
      "id": "m1_2",
      "mod": 1,
      "mod_name": "Module Name",
      "q": "True/false statement.",
      "type": "T/F",
      "opts": ["True", "False"],
      "ans": 0,
      "exp": "Why this is true, with supporting detail."
    }
  ]
}
```

**Schema rules:**
| Field | Required | Notes |
|---|---|---|
| `title` | recommended | Deck display name |
| `description` | recommended | One sentence |
| `id` | yes | Unique string, convention `m{mod}_{n}` |
| `mod` | yes | Integer, same value = same module |
| `mod_name` | yes | Module display name |
| `q` | yes | Question text |
| `opts` | yes | 2–8 strings; T/F must be `["True","False"]` |
| `ans` | yes | Zero-based index of correct option |
| `type` | only for T/F | `"T/F"` — omit for MCQ |
| `exp` | strongly recommended | Explanation shown after answering |

---

### 5. Save the file

Save the JSON to the user's workspace. Suggested filename pattern:

```
{deck-title-slugified}.json
```

For example: `cs6250-exam-2.json` or `biology-chapter-5.json`.

After saving, give the user a brief summary:
- Total questions generated
- Number of modules and their names
- Link to the saved file

Tell them to drop the file on the **Upload** card at quiz.jseverino.net (or their local instance) to load it.

---

## Common input types

| Input | How to handle |
|---|---|
| PDF | Use the Read tool to extract text, then proceed normally |
| Slides / PPTX | Extract slide text; treat each slide section as a potential question source |
| Plain text / notes | Read directly |
| Outline or bullet points | Each bullet is a concept; generate 1–3 questions per major point |
| Existing Q&A list | Adapt directly into the schema — clean up formatting, add `exp` fields |
| No document provided | Ask the user to paste or upload the material before proceeding |

---

## Quality checklist before saving

Before writing the file, verify:

- [ ] Every question has a unique `id`
- [ ] All `ans` values are valid indices into their `opts` array
- [ ] No `opts` array has fewer than 2 or more than 8 items
- [ ] All T/F questions have `"type": "T/F"` and `opts: ["True", "False"]`
- [ ] Every question has an `exp`
- [ ] Questions are distributed across modules — no module has fewer than 3 questions
- [ ] The JSON is valid (no trailing commas, proper quoting)
