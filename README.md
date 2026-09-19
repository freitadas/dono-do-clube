# Dono do Clube v3 — Liga + Libertadores

Esta versão reinicia o progresso esportivo dos clubes uma única vez no primeiro deploy desta versão, preservando contas, nome do clube, cores, escudo e amigos.

## Liga

- 20 clubes.
- 38 rodadas.
- Todos contra todos em ida e volta.
- Cada clube faz exatamente 19 jogos em casa e 19 fora.
- Cada rodada possui 10 partidas.
- Ao jogar a próxima rodada, os outros jogos da rodada também são simulados.
- Os 4 primeiros se classificam para a Libertadores.

## Libertadores

- Criada automaticamente ao fim da 38ª rodada.
- 32 clubes no total.
- 4 classificados da Liga + 28 clubes sorteados.
- 8 grupos de 4 clubes.
- Ida e volta dentro do grupo.
- 6 jogos por clube.
- Os 2 primeiros de cada grupo avançam.
- Mata-mata com oitavas, quartas e semifinais em ida e volta.
- Final em jogo único.
- Empates no agregado ou na final são decididos por pênaltis.

## Recursos mantidos

- Login e persistência PostgreSQL.
- Personalização de nome, cores e escudo.
- Mercado.
- Rescisão.
- Estatísticas individuais.
- Visualização de elencos.
- Amigos e amistosos.
