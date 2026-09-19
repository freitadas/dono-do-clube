# Dono do Clube v14 — Copa do Brasil, troféus, calendário e mercado de vendas

Esta versão mantém os recursos anteriores e adiciona novas camadas de temporada, finanças e transferências.

## Troféus e fim de temporada

Ao terminar a temporada, a tela inicial mostra os troféus conquistados naquela temporada.

Também existe uma galeria permanente de troféus do clube. Podem ser registrados:
- Campeonato Estadual;
- Série A, B, C ou D;
- Copa do Brasil;
- Libertadores.

Os troféus ficam salvos no PostgreSQL e continuam aparecendo nas temporadas seguintes.

## Copa do Brasil

Foi adicionada a **Copa do Brasil** na aba Competições.

Formato do jogo:
- 32 clubes brasileiros;
- mata-mata;
- primeira fase com 32 clubes;
- oitavas de final;
- quartas de final;
- semifinais;
- final;
- jogos em partida única;
- empate decidido nos pênaltis.

O clube do usuário entra no torneio em todas as temporadas. A Copa fica disponível após o fim do Estadual. Se o usuário for eliminado, o restante é simulado automaticamente até definir o campeão.

## Calendário e salários mensais

Os salários **não são mais pagos por rodada**.

A temporada possui um calendário próprio:
- a data avança a cada compromisso oficial do usuário;
- a folha salarial é cobrada uma vez quando o calendário entra em um novo mês;
- a tela inicial mostra a data atual;
- mostra a próxima data de pagamento;
- mostra o valor da folha mensal;
- mostra os pagamentos recentes.

Receitas de bilheteria, patrocinadores e bônus de resultado continuam ligadas às partidas, mas os salários ficam separados no calendário mensal.

## Vender jogadores

Na aba Elenco, cada jogador possui a opção **Colocar à venda**.

Ao colocar um atleta à venda:
- ele entra na lista de transferências do clube;
- clubes controlados pelo jogo podem enviar propostas;
- uma proposta também pode surgir durante os ciclos mensais do calendário;
- o jogador pode ser retirado da lista de transferências.

Na aba Mercado existe a seção **Propostas recebidas**, onde é possível:
- ver qual clube fez a proposta;
- ver o valor oferecido;
- aceitar a venda;
- recusar a proposta;
- procurar novas propostas.

Ao aceitar:
- o jogador é transferido para o clube comprador;
- o valor entra no caixa;
- as demais propostas pendentes pelo mesmo jogador expiram.

## Transfer ban por endividamento

Se o caixa do clube ficar abaixo de **-10.000 moedas**, entra em vigor um transfer ban.

Durante o transfer ban:
- novas contratações ficam bloqueadas;
- a pesquisa de jogadores continua disponível;
- vendas continuam permitidas para ajudar a recuperar o caixa;
- propostas recebidas continuam funcionando.

O ban é removido automaticamente quando o saldo volta para pelo menos -10.000 moedas.

## Mercado e salários

As negociações de contratação agora usam **salário mensal**. O jogador continua podendo aceitar ou recusar com base em salário, duração de contrato, divisão e projeto esportivo.

## Recursos anteriores mantidos

- Séries A, B, C e D;
- 20 clubes por divisão;
- 38 rodadas, ida e volta;
- acesso e rebaixamento;
- Estaduais;
- Libertadores;
- escalação visual;
- botão Escalar melhores;
- rodízio;
- fadiga, moral e lesões;
- mercado com negociação;
- personalização e escudo;
- jogar contra amigos;
- Modo Felipe;
- opção de apagar o time e reiniciar;
- simulação otimizada de uma rodada por clique;
- persistência de dados no PostgreSQL.
