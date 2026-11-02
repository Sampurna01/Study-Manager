export const SAMPLE_COURSE = {
  title: "Intro to Cell Biology",
  content: `# Cell Theory
Cell theory states that all living things are made of one or more cells. The cell is the basic unit of structure and function in living organisms. All cells arise from pre-existing cells by division. Robert Hooke first described cells in 1665 after observing cork under a microscope.

# Prokaryotic and Eukaryotic Cells
Prokaryotic cells lack a nucleus and membrane-bound organelles. Their DNA is located in a region called the nucleoid. Bacteria and archaea are prokaryotes. Eukaryotic cells have a nucleus that encloses their DNA, as well as membrane-bound organelles. Animals, plants, fungi and protists are eukaryotes. Eukaryotic cells are typically ten times larger than prokaryotic cells.

# The Plasma Membrane
The plasma membrane is a phospholipid bilayer that separates the cell from its environment. Phospholipids have hydrophilic heads and hydrophobic tails, so the tails face inward. The fluid mosaic model describes the membrane as a fluid layer with embedded proteins that can move laterally. The membrane is selectively permeable: small nonpolar molecules such as oxygen cross freely, while ions and large polar molecules need transport proteins.

# Transport Across Membranes
Diffusion is the movement of molecules from an area of higher concentration to lower concentration. Osmosis is the diffusion of water across a selectively permeable membrane. Facilitated diffusion uses channel or carrier proteins and requires no energy. Active transport moves substances against their concentration gradient and requires energy from ATP. The sodium-potassium pump is an example of active transport that pumps three sodium ions out and two potassium ions in. In a hypotonic solution a cell gains water and may swell; in a hypertonic solution it loses water and shrinks.

# Organelles
The nucleus stores the cell's DNA and controls gene expression. Ribosomes synthesise proteins by translating messenger RNA. The rough endoplasmic reticulum is studded with ribosomes and processes proteins for secretion. The smooth endoplasmic reticulum synthesises lipids and detoxifies drugs. The Golgi apparatus modifies, sorts and packages proteins into vesicles. Lysosomes contain digestive enzymes that break down waste. Mitochondria produce ATP through cellular respiration and have their own DNA. Chloroplasts, found in plants and algae, perform photosynthesis.

# Cellular Respiration
Cellular respiration converts glucose and oxygen into carbon dioxide, water and ATP. Glycolysis occurs in the cytoplasm and splits glucose into two pyruvate molecules, producing a net gain of 2 ATP. The Krebs cycle occurs in the mitochondrial matrix and releases carbon dioxide. The electron transport chain on the inner mitochondrial membrane produces most of the ATP, about 32 to 34 molecules per glucose. Without oxygen, cells rely on fermentation, which regenerates NAD+ but yields only 2 ATP per glucose.

# The Cell Cycle
The cell cycle consists of interphase and the mitotic phase. Interphase includes G1, S and G2; DNA is replicated during the S phase. Mitosis has four stages: prophase, metaphase, anaphase and telophase. During metaphase chromosomes line up at the cell's equator. During anaphase sister chromatids separate and move to opposite poles. Cytokinesis divides the cytoplasm to produce two identical daughter cells. Checkpoints regulate the cycle, and loss of this regulation can lead to cancer.`,
};

/** A sample syllabus whose dates are relative to today, so countdowns are meaningful. */
export function sampleSyllabus(today = new Date()): string {
  const day = (offset: number) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const year = today.getFullYear();
  return `BIO 101: Introduction to Cell Biology — Syllabus
Term: ${today.getMonth() < 6 ? "Spring" : "Fall"} ${year}
Instructor: Dr. A. Rivera (office hours Tue/Thu 2–3pm)

Course description
An introduction to the structure and function of cells: membranes, organelles, energy and cell division.

Learning outcomes
By the end of the course students will be able to:
- Compare prokaryotic and eukaryotic cells.
- Explain how substances cross the plasma membrane.
- Describe the stages of cellular respiration and where they occur.
- Describe the phases of the cell cycle and mitosis.

Schedule
Week 1 (${day(-14)}): Cell theory; prokaryotic and eukaryotic cells. Reading: Ch. 1–2
Week 2 (${day(-7)}): The plasma membrane and transport across membranes. Reading: Ch. 3
Week 3 (${day(0)}): Organelles. Reading: Ch. 4
Week 4 (${day(7)}): Cellular respiration. Reading: Ch. 5
Week 5 (${day(14)}): The cell cycle and mitosis. Reading: Ch. 6
Week 6 (${day(21)}): Photosynthesis. Reading: Ch. 7

Grading
Weekly quizzes: 15%
Lab reports: 20% (due ${day(5)})
Midterm exam: 25% (${day(10)}) — covers weeks 1–4
Final exam: 40% (${day(28)}) — cumulative

Required materials
Campbell Biology, 12th edition.`;
}
