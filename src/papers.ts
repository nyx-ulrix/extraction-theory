// Specialty filter papers offered in the brew form, by brand (checked against retailer listings, 2026).
// Shown as "Brand Model"; papers saved on the sheet's Gear tab and anything typed before are added on top.
export const PAPERS: Record<string, string[]> = {
  AeroPress: ["Paper Micro-Filters", "XL Paper Micro-Filters"],
  April: ["Paper Filter Large", "Paper Filter Small"],
  CAFEC: [
    "Abaca Cone 1 Cup", "Abaca Cone 1 Cup Brown", "Abaca Cone 4 Cup", "Abaca Cone 4 Cup Brown", "Abaca Trapezoid 102", "Abaca Trapezoid 103",
    "Abaca+ Cone 1 Cup", "Abaca+ Cone 4 Cup", "Abaca+ Deep 27", "Dark Roast T-83 Cone 1 Cup", "Dark Roast T-83 Cone 4 Cup",
    "Light Roast T-92 Cone 1 Cup", "Light Roast T-92 Cone 4 Cup", "Medium Roast T-90 Cone 1 Cup", "Medium Roast T-90 Cone 4 Cup",
    "Traditional Cone 1 Cup", "Traditional Cone 4 Cup",
  ],
  Chemex: ["Bonded Circles", "Bonded Half Moon", "Bonded Half Moon Natural", "Bonded Squares", "Bonded Squares Natural"],
  Fellow: ["Stagg [X] Filters", "Stagg [XF] Filters"],
  Graycano: ["GC01"],
  Hario: [
    "Flow Filter 155", "Pegasus 01", "Pegasus 02", "Pegasus 03", "V60 01 Natural", "V60 01 White", "V60 02 Natural", "V60 02 White",
    "V60 03 Natural", "V60 03 White", "V60 Meteor 01", "V60 Meteor 02",
  ],
  HiFlux: ["Cone Folding V", "Purity Wave 155", "Purity Wave 185", "Wave 155", "Wave 185"],
  Kalita: ["102", "103", "Wave 155", "Wave 155 Brown", "Wave 185"],
  Kinto: ["SCS-02 Cotton", "SCS-04 Cotton"],
  Kono: ["MD-25", "MD-45", "Silky MS-25", "Silky MS-45"],
  Melitta: ["Original 1x2", "Original 1x4"],
  "Nana Coffee Roasters": ["Competition Cone 02", "Competition Wave 185"],
  NextLevel: ["Pulsar Filters"],
  Orea: ["Big Boy Wave", "Type G 155", "Type G 185", "Wave 155", "Wave 185"],
  Origami: ["Cone M", "Cone S", "Wave M", "Wave S"],
  Sibarist: [
    "B3 Cone M", "B3 Flat M", "B3 Flat S", "B3 Hybrid M", "B3 Hybrid S", "B3 Wave", "Dual Chamber Cone M", "FAST Cone M", "FAST Cone S",
    "FAST Cone XL", "FAST Disc 63", "FAST Flat 2 M", "FAST Flat M", "FAST Flat S", "FAST Syphon", "FAST Trapezoid", "FAST Wave",
    "Graycano FAST Cone", "Orea B3 Cone V4 Wide", "Orea FAST Flat", "Orea FAST Flat 2 Narrow", "Origami FAST Flat S", "UFO B3 Flat", "UFO FAST Cone",
  ],
  Timemore: ["B75 Wave 01", "V-01", "V-02"],
  Tricolate: ["Paper Filters"],
};

export const PAPER_NAMES = Object.entries(PAPERS).flatMap(([brand, names]) => names.map((n) => `${brand} ${n}`));
