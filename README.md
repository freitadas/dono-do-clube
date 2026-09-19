# Dono do Clube v4 — Brasileirão A/B/C/D + Estaduais

Esta versão reinicia uma única vez o progresso esportivo no primeiro deploy desta versão.

## Carreira
- O clube do usuário começa sempre na Série D.
- Antes do Brasileirão, disputa o Campeonato Estadual do estado escolhido.
- Ao fim da temporada aparece o botão para iniciar a próxima temporada.
- Elenco, moedas, escudo, amigos e estatísticas acumuladas continuam entre temporadas.

## Séries do jogo
Todas usam 20 clubes e 38 rodadas, com turno e returno:
- Série A: top 4 vai à Libertadores; 4 últimos caem para B.
- Série B: top 4 sobe para A; 4 últimos caem para C.
- Série C: top 4 sobe para B; 4 últimos caem para D.
- Série D: top 4 sobe para C; sem rebaixamento.

A composição inicial das divisões é uma estrutura própria do jogo. As Séries C e D reais da CBF usam formatos diferentes; aqui elas foram uniformizadas para o formato de 20 clubes/38 rodadas solicitado.

## Estaduais
- O estado é escolhido ao criar o clube.
- Usuários antigos desta versão anterior escolhem o estado novamente após o reset.
- 8 clubes por Estadual.
- 7 rodadas classificatórias.
- Top 4 para semifinais.
- Final em jogo único.

## Dificuldade
- Série D: adversários mais acessíveis.
- Série C: dificuldade intermediária.
- Série B: nível forte.
- Série A: nível mais alto.
- Jogadores iniciais do usuário foram equilibrados para competir na Série D.

## Libertadores
- 32 clubes.
- Os 4 primeiros da Série A + 28 clubes continentais.
- 8 grupos de 4.
- 6 jogos por clube na fase de grupos.
- Top 2 de cada grupo avança.
- Oitavas, quartas e semifinais em ida e volta.
- Final em jogo único.
- Clubes de divisões inferiores não ganham vaga direta na Libertadores.

## Recursos mantidos
- Login e dados persistentes no PostgreSQL.
- Personalização com escudo.
- Mercado e rescisão.
- Estatísticas de jogadores.
- Visualização de elencos.
- Amigos e amistosos.
