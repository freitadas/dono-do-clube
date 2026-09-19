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


## Mercado e finanças v15

### Jogador contratado na carreira
Quando uma compra ou empréstimo é concluído, o jogador deixa de aparecer no mercado **daquela carreira** enquanto estiver no elenco. Ele continua disponível para ser contratado em outras carreiras independentes.

### Compras parceladas
Transferências entre clubes podem ser fechadas em até **24 parcelas**.
- a primeira parcela e as luvas são pagas no momento da contratação;
- as parcelas restantes vencem mensalmente no calendário financeiro;
- parcelas futuras podem levar o clube ao endividamento e ativar o transfer ban.

### Empréstimos
Jogadores de clubes controlados pelo jogo podem ser emprestados por 3, 6 ou 12 meses.
- o clube paga uma taxa mensal de empréstimo;
- o salário do atleta entra na folha mensal do clube;
- jogadores considerados importantes para o clube de origem não podem ser emprestados;
- ao terminar o prazo ou a temporada, a cópia emprestada sai daquela carreira; o jogador-base das demais carreiras não é afetado;
- transfer ban bloqueia novos empréstimos.

### Patrocínios
A tela inicial apresenta propostas de patrocinadores de acordo com a divisão.
- cada contrato possui luvas e pagamento mensal;
- o dinheiro mensal entra no fechamento do calendário;
- ao subir de divisão, as futuras propostas de patrocínio também melhoram.

### Mercado progressivo
O nível dos jogadores disponíveis aumenta conforme o clube sobe:
- Série D: mercado mais modesto;
- Série C: jogadores melhores;
- Série B: atletas mais fortes;
- Série A: acesso ao nível mais alto do mercado.

### Preços mais justos
O valor de mercado considera preço-base, idade, overall e duração contratual.
- clubes vendedores pedem um prêmio moderado sobre o valor justo;
- propostas recebidas pelo seu clube ficam próximas do valor justo;
- ofertas muito abaixo do valor esperado podem ser recusadas.


## Sistema de carreiras v16

Cada conta pode manter até **10 carreiras diferentes**.

Cada carreira possui de forma independente:
- clube;
- elenco;
- dinheiro;
- divisão;
- temporadas;
- competições;
- troféus;
- patrocínio;
- calendário financeiro;
- dívidas e transfer ban.

A aba **CARREIRAS** permite:
- ver todos os saves;
- trocar instantaneamente a carreira ativa;
- criar uma nova carreira;
- apagar uma carreira específica sem apagar as demais.

A carreira que já existia antes da atualização é migrada automaticamente para **Carreira 1**.


## Mercado individual por carreira — v17

O mercado compartilhado entre usuários foi removido.

Agora cada carreira funciona como um save totalmente independente:
- jogadores de uma pessoa **não aparecem** no mercado de outra pessoa;
- jogadores colocados à venda recebem propostas apenas dos clubes controlados pelo jogo;
- não existem transferências diretas entre usuários;
- uma negociação feita em uma carreira não altera o elenco nem o mercado de outra carreira;
- rescisões e vendas também afetam somente o save em que foram feitas.

### O mesmo jogador em várias carreiras

Os jogadores do mercado funcionam como jogadores-base. Quando uma carreira compra ou pega um atleta emprestado, o jogo cria uma instância própria daquele jogador para esse save.

Assim:
- a Carreira 1 pode contratar um jogador;
- a Carreira 2 pode contratar o mesmo jogador;
- outro usuário também pode contratar esse mesmo jogador;
- cada cópia passa a evoluir, cansar, marcar gols, receber salário e trocar de clube apenas dentro da própria carreira;
- contratar o atleta em uma carreira não faz ele desaparecer das demais;
- dentro da mesma carreira, o mesmo jogador-base não pode ser contratado duas vezes simultaneamente.

O limite de **10 carreiras por conta** foi mantido.


## Salvamento manual — v18

Foi adicionado o botão **💾 SALVAR** no topo do jogo.

O jogo continua salvando automaticamente as ações normais, mas agora existe também um save manual por carreira.

- salva somente a carreira ativa;
- registra data e hora do último salvamento manual;
- a informação aparece na aba **CARREIRAS**;
- não altera nenhuma das outras carreiras;
- quando usado dentro da aba **ELENCO**, também grava a formação e os 11 titulares selecionados, se a escalação estiver válida.

Cada uma das até 10 carreiras mantém seu próprio horário de último save manual.


## Aba TITULARES — v19

Foi adicionada uma nova aba **TITULARES** na barra inferior, ao lado de **INÍCIO** e **ELENCO**.

A aba **ELENCO** foi mantida.

Na nova aba TITULARES é possível:
- ver somente os 11 titulares;
- visualizar a formação no campo;
- conferir overall, físico e moral;
- usar **Escalar melhores**;
- usar **Sugerir rodízio**;
- trocar a formação;
- salvar os titulares;
- abrir rapidamente o elenco completo.

A aba ELENCO continua contendo todos os jogadores, reservas e as opções completas de gestão.


## Escalação mais intuitiva — v20

A aba **TITULARES** foi simplificada para montar o time sem precisar procurar jogadores em vários cards.

Agora:
- a tela mostra um passo a passo curto;
- trocar a formação reorganiza automaticamente os jogadores, tentando preservar os titulares atuais;
- basta clicar em um jogador no campo para abrir os reservas compatíveis;
- também existe botão **Trocar** em cada titular;
- só aparecem reservas da mesma faixa de posição e sem lesão;
- os reservas ficam em uma lista recolhível;
- **Usar os melhores** monta o time pelo overall;
- **Priorizar descansados** monta o time considerando condição física;
- a tela informa claramente quando existem alterações ainda não salvas;
- o botão **Salvar escalação** fica mais fácil de alcançar;
- a aba **ELENCO** continua disponível e não foi removida.


## Países e modo carreira de jogador — v21

### Carreira de clube em outros países

Ao criar uma nova carreira de clube, agora é possível escolher:

- Brasil
- Inglaterra
- Espanha
- Itália
- Alemanha
- França
- Portugal
- Argentina

Cada país possui nomes próprios para as quatro divisões e para a copa nacional.

Exemplos:
- Inglaterra: Premier League, Championship, League One, League Two e FA Cup;
- Espanha: La Liga, Segunda División e Copa del Rey;
- Itália: Serie A, Serie B e Coppa Italia;
- Alemanha: Bundesliga, 2. Bundesliga e DFB-Pokal;
- França: Ligue 1, Ligue 2 e Coupe de France;
- Portugal: Liga Portugal e Taça de Portugal;
- Argentina: Primera División e Copa Argentina.

Para manter o mesmo sistema de progressão do jogo, todas as pirâmides usam o formato padronizado de **20 clubes, 38 rodadas e quatro divisões**. Portanto, este é um formato de jogo simplificado e não uma reprodução exata dos regulamentos reais de todas as federações.

No Brasil, a carreira continua começando na Série D e disputando também o Estadual.

Nos demais países:
- a carreira começa na quarta divisão correspondente;
- não existe Estadual;
- há uma copa nacional mata-mata;
- promoção e rebaixamento continuam funcionando entre as quatro divisões.

A Libertadores permanece no modo de clube brasileiro. As carreiras europeias e argentina, nesta versão, encerram a temporada após liga e copa nacional.

### Carreira de jogador

Na criação de um novo save existe agora a opção **Carreira de Jogador**.

É possível escolher:
- nome do jogador;
- nacionalidade;
- país onde a carreira será disputada;
- posição;
- clube inicial da quarta divisão.

O jogador começa com 17 anos.

O modo inclui:
- 38 rodadas por temporada;
- nota individual por partida;
- gols e assistências;
- jogos disputados;
- clean sheets para goleiros;
- físico;
- moral;
- overall;
- salário;
- saldo pessoal;
- pontos de evolução;
- treino de velocidade, chute, passe e defesa;
- recuperação física;
- tabela da liga;
- histórico das partidas;
- propostas de transferência ao fim da temporada;
- possibilidade de aceitar um clube de divisão superior;
- promoção/rebaixamento do clube quando o jogador permanece;
- envelhecimento e passagem para a temporada seguinte;
- salvamento manual próprio.

### Limite de saves

O limite continua sendo de **10 carreiras por conta**, somando:
- carreiras de clube;
- carreiras de jogador.

É possível misturar os dois tipos livremente na aba **CARREIRAS**.

### Independência dos saves

Cada carreira continua independente. Uma carreira em outro país ou uma carreira de jogador não altera elenco, dinheiro, tabela, troféus ou progresso das demais.
