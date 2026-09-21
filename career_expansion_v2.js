/*
 EXPANSÃO MODO CARREIRA V2
 Novos sistemas para aumentar profundidade da carreira
*/

const CareerExpansionV2 = {

  personality: {
    traits: [
      "lider",
      "humilde",
      "ambicioso",
      "polemico",
      "profissional"
    ],
    effects: [
      "moral",
      "torcida",
      "imprensa",
      patrocinadores"
    ]
  },

  trainingCenter: {
    individualTraining: true,
    coachRelationship: true,
    fatigue: true,
    recovery: true
  },

  contracts: {
    clauses: [
      "bonus_por_gols",
      "bonus_por_titulos",
      "multa_rescisoria",
      "tempo_de_contrato"
    ]
  },

  careerMarket: {
    transferRumors: true,
    scouts: true,
    interestLevel: true
  },

  matches: {
    awards: [
      "melhor_da_partida",
      "gol_da_rodada",
      "assistencia_da_rodada"
    ],
    records: true
  },

  lifestyle: {
    house: true,
    cars: true,
    investments: true,
    charity: true
  },

  rivalries: {
    rivals: true,
    derbyPressure: true,
    fanReactions: true
  },

  trophies: {
    clubTitles: true,
    individualTitles: true,
    hallOfFame: true
  },

  retirement: {
    academy: true,
    managerCareer: true,
    clubOwnership: true
  }
};

if (typeof module !== "undefined") {
 module.exports = CareerExpansionV2;
}