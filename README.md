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


## Mercado real + Champions + Super Mundial — v22

### Mercado com nomes de jogadores reais

O mercado agora recebe um catálogo adicional com nomes de jogadores reais.

Características:
- pesquisa pelo nome;
- filtro **Só jogadores reais**;
- jogadores reais aparecem com selo **REAL**;
- os mesmos jogadores podem existir em carreiras independentes;
- contratar em um save não remove o jogador dos demais saves;
- o nível disponível aumenta conforme a divisão;
- na elite, o mercado pode exibir jogadores de nível mundial.

Importante: os **ratings, atributos, idades de jogo, preços e salários são parâmetros internos de balanceamento** e não representam uma base oficial, um videogame comercial ou dados de mercado ao vivo.

### UEFA Champions League

Carreiras de clube em Inglaterra, Espanha, Itália, Alemanha, França e Portugal agora podem disputar a UEFA Champions League.

Regra de classificação do jogo:
- terminar entre os 4 primeiros da primeira divisão nacional.

Formato usado:
- 36 clubes;
- fase de liga;
- 8 partidas por clube;
- 1º ao 8º avançam diretamente às oitavas;
- 9º ao 24º disputam playoff;
- mata-mata em ida e volta;
- final em jogo único.

A Champions possui:
- tabela própria;
- playoff;
- oitavas;
- quartas;
- semifinais;
- final;
- premiação e troféu.

### Super Mundial de Clubes

Foi incluído o **Super Mundial de Clubes com 32 participantes**.

Distribuição das 32 vagas:
- UEFA: **12**
- CONMEBOL: **6**
- AFC: **4**
- CAF: **4**
- CONCACAF: **4**
- OFC: **1**
- País-sede: **1**

Total: **32 clubes**.

Formato do jogo:
- 8 grupos de 4;
- 3 partidas por clube na fase de grupos;
- os 2 primeiros de cada grupo avançam;
- oitavas de final;
- quartas de final;
- semifinais;
- final;
- mata-mata em jogo único.

O Super Mundial ocorre em ciclo de quatro temporadas, nas temporadas **1, 5, 9, 13...**, acompanhando o calendário quadrienal iniciado na primeira temporada da carreira.

Para o clube do usuário, a qualificação foi simplificada para o jogo:
- campeão da primeira divisão nacional; ou
- campeão da Libertadores/Champions na temporada do Super Mundial.

Os demais participantes são preenchidos respeitando exatamente o número de vagas por confederação informado acima.

### Carreira de jogador — propostas internacionais

Ao terminar cada temporada da carreira de jogador, o atleta recebe **3 propostas**.

As ofertas podem vir:
- de clubes do país atual;
- de clubes de outros países disponíveis no jogo.

Cada proposta informa:
- clube;
- país;
- divisão;
- salário.

Ao aceitar uma proposta internacional:
- a transferência fica acertada para a temporada seguinte;
- ao avançar a temporada, o jogador muda de país, liga e clube;
- a nacionalidade do atleta não muda.



## Simular temporada inteira + salários equilibrados — v23

### Botão Simular Temporada Inteira

Foi adicionado o botão **⏩ SIMULAR TEMPORADA INTEIRA**.

No modo carreira de clube, ele conclui rapidamente tudo o que ainda estiver pendente na temporada:
- Estadual, quando existir;
- copa nacional;
- rodadas restantes da liga;
- Libertadores;
- Champions League;
- Super Mundial, quando a temporada tiver essa competição.

A simulação também:
- mantém a classificação e os resultados;
- registra os últimos jogos simulados;
- processa a passagem do calendário até o fim da temporada;
- processa salários mensais, patrocínios, parcelas e empréstimos que vencem no período;
- registra troféus conquistados;
- mantém promoção e rebaixamento para a próxima temporada.

No modo carreira de jogador, o mesmo botão:
- simula todas as rodadas restantes;
- continua calculando nota individual;
- gols;
- assistências;
- físico;
- moral;
- pontos de evolução;
- salários;
- classificação;
- três propostas de transferência no fim da temporada.

A simulação não inicia automaticamente a temporada seguinte. O usuário ainda pode conferir o resultado final antes de avançar.

### Salários dos jogadores reais

Os jogadores com nomes reais agora usam **exatamente a mesma fórmula-base de salário dos jogadores normais do jogo**, de acordo com o overall.

Assim, um jogador real não recebe um salário artificialmente maior apenas por ter um nome real. O salário sugerido continua podendo variar durante a negociação, como já ocorre com os demais jogadores.


## Mata-mata com ida, volta e pênaltis — v24

### Copa do Brasil

A Copa do Brasil agora é disputada em **jogos de ida e volta em todas as fases, inclusive a final**.

- o placar agregado dos dois jogos decide o classificado;
- não existe regra de gol fora;
- se o placar agregado terminar empatado após o jogo de volta, a vaga é decidida nos pênaltis;
- a interface mostra claramente **IDA**, **VOLTA**, o **AGREGADO** e o clube classificado;
- quando houver pênaltis, aparece o placar da disputa, por exemplo `5 × 4`, e o nome de quem avançou.

As outras copas nacionais do jogo continuam com o formato próprio já existente; a mudança para ida e volta é específica da Copa do Brasil.

### UEFA Champions League

O mata-mata da Champions agora deixa explícito o sistema de:
- jogo de **IDA**;
- jogo de **VOLTA**;
- placar **AGREGADO**;
- pênaltis quando o agregado terminar empatado.

O playoff, oitavas, quartas e semifinais são disputados em ida e volta. A **final continua em jogo único**, como no formato real da Champions League. Se a final empatar, também é exibido o placar dos pênaltis.

### Pênaltis visíveis

Os placares das disputas por pênaltis também passam a aparecer nos demais mata-matas que utilizam desempate por pênaltis, como Libertadores, Estadual e Super Mundial.


## Correção do XI titular — v25

Corrigido o problema em que o campo podia aparecer com apenas 5, 6 ou outro número menor que 11 jogadores.

Agora, sempre que a carreira de clube é carregada:
- o jogo confere a escalação salva;
- se ela já possui 11 titulares válidos, nada é alterado;
- se faltarem titulares, o sistema completa automaticamente o XI;
- a formação atual é respeitada sempre que o elenco possui jogadores suficientes por posição;
- os titulares já escolhidos têm preferência, para evitar mudanças desnecessárias;
- em seguida entram os jogadores de maior overall, físico e moral;
- o sistema preserva pelo menos um goleiro;
- a correção também funciona depois de vendas, empréstimos, lesões ou outras alterações de elenco.

O campo passa a mostrar novamente os **11 jogadores** em vez de manter uma escalação quebrada.


## Jornal, coletivas e Projeto SAF — v26

### Jornal da carreira

Foi criada a nova aba **JORNAL**. Ela acompanha a carreira como uma cobertura esportiva e publica notícias sobre:
- resultados das partidas;
- eliminações;
- títulos;
- acontecimentos de bastidores;
- patrocínios;
- decisões financeiras;
- venda do clube para uma SAF;
- sanções por dívida.

As matérias têm diferentes veículos fictícios dentro do jogo, como **Jornal do Clube**, **Central da Bola**, **Esporte Agora**, **Diário do Futebol** e **Portal da Torcida**.

A página inicial também mostra as últimas manchetes e um botão para abrir o jornal completo.

### Coletivas de imprensa

Após uma eliminação ou um jogo considerado importante, pode surgir uma coletiva de imprensa.

O treinador precisa escolher uma resposta entre três linhas:
- **Assumir responsabilidade** — melhora a relação com a torcida e dá pequeno ganho de moral;
- **Proteger o elenco** — produz o maior ganho de moral do grupo;
- **Cobrar reação** — aumenta o apoio de parte da torcida, mas pode reduzir o moral do elenco.

A resposta escolhida gera uma nova matéria na imprensa.

São considerados importantes, entre outros:
- semifinais e finais de copas;
- mata-matas continentais;
- jogos decisivos no fim da liga;
- goleadas;
- eliminações.

### Projeto SAF

Na aba **CLUBE** existe agora a seção **Projeto SAF**. Antes da venda, aparecem propostas de investidores com aportes diferentes.

O valor do investimento aumenta conforme a divisão do clube. As propostas representam um aporte grande em relação à economia normal da carreira.

Depois de aceitar uma proposta:
- o clube passa definitivamente a ser uma **SAF** naquela carreira;
- o aporte entra imediatamente no caixa;
- a operação vira notícia de destaque;
- a SAF não pode ser desfeita nessa carreira.

### Regra financeira exclusiva da SAF

A consequência especial pedida existe **somente para clubes que foram vendidos para SAF**.

Ao fim de cada temporada, o jogo registra o saldo financeiro daquele momento. Se uma SAF terminar o ano com saldo negativo:
- Série A / primeira divisão → cai para a divisão B;
- divisão B → cai para C;
- divisão C → cai para D;
- divisão D → permanece na divisão mais baixa, pois não existe divisão inferior no sistema atual.

O rebaixamento é administrativo e independe da posição esportiva do time na tabela.

Clubes que **não são SAF** não sofrem esse rebaixamento automático por dívida.

O saldo de fim de ano fica registrado quando a temporada encerra, portanto recuperar dinheiro depois do encerramento não apaga a sanção daquela temporada.


## Jornal ampliado, Diretoria e correção da escalação — v27

### Correção do campo / goleiros

Foi corrigido o problema em que uma formação podia aparecer com dois goleiros e menos jogadores de linha do que deveria.

Agora:
- a escalação tenta respeitar exatamente a quantidade de jogadores de cada setor da formação;
- o sistema nunca usa um segundo goleiro para preencher uma vaga de zagueiro, meio-campista ou atacante;
- ao carregar a carreira, uma escalação inválida é reparada automaticamente;
- a seleção manual impede escolher um segundo goleiro como titular enquanto já existe um goleiro no XI;
- os botões **Usar os melhores**, **Priorizar descansados** e a troca de formação também evitam esse problema.

### Jornal com notícias dos outros clubes

O **JORNAL** deixou de acompanhar apenas o clube do usuário.

Agora existe a seção **Giro do Futebol**, com:
- resultados de outros clubes;
- situação dos rivais na tabela;
- notícias de clubes que estão brigando pelas primeiras posições;
- goleadas de outros clubes.

O jornal continua mostrando também as notícias do seu próprio time.

### Goleadas no jornal

Uma partida com diferença de **3 gols ou mais** passa a ser tratada como goleada.

Quando o seu clube aplica uma goleada:
- a notícia recebe destaque;
- a confiança da diretoria aumenta;
- a pressão da mídia pode cair;
- a diretoria envia uma mensagem de elogio.

Quando o seu clube sofre uma goleada:
- a notícia aparece em destaque;
- a confiança da diretoria cai;
- a pressão da mídia aumenta;
- a diretoria envia uma cobrança.

As maiores goleadas também são publicadas quando a temporada inteira é simulada.

### Coletiva de imprensa com consequências

As respostas da coletiva agora têm efeitos objetivos no jogo.

**Assumir responsabilidade**
- torcida +250;
- moral do elenco +3;
- confiança da diretoria +4;
- pressão da mídia -2.

**Proteger o elenco**
- torcida +60;
- moral do elenco +7;
- confiança da diretoria -1;
- pressão da mídia -3.

**Cobrar reação**
- torcida +320;
- moral do elenco -3;
- confiança da diretoria +1;
- pressão da mídia +4.

Após escolher uma resposta, o jogo mostra as consequências e registra a repercussão no jornal.

### Aba DIRETORIA

Foi criada a nova aba **DIRETORIA**.

Ela mostra:
- expectativa da temporada;
- posição-alvo;
- posição atual;
- confiança da diretoria, de 0 a 100;
- pressão da mídia, de 0 a 100;
- caixa de mensagens do conselho.

A diretoria envia mensagens após:
- títulos;
- eliminações;
- goleadas aplicadas;
- goleadas sofridas.

Nas divisões B, C e D, a expectativa padrão é lutar pelo acesso e terminar no G4. Na primeira divisão, a diretoria passa a exigir campanha de elite, podendo cobrar disputa pelo título de equipes mais fortes.

Se o clube for uma SAF, a expectativa também lembra que a temporada deve terminar sem dívida para evitar o rebaixamento administrativo.


## Novas formações + formação personalizada — v28

A tela de escalação agora possui mais opções táticas.

Formações prontas:
- 4-3-3
- 4-4-2
- 3-5-2
- 4-2-3-1
- 4-1-4-1
- 4-5-1
- 3-4-3
- 3-4-2-1
- 3-1-4-2
- 5-3-2
- 5-4-1
- 5-2-3
- 4-2-4

Algumas formações, como 4-2-3-1, 4-1-4-1, 3-4-2-1 e 3-1-4-2, aparecem no campo com linhas de meio-campo em alturas diferentes para representar melhor o desenho tático.

### Formação personalizada

A opção **Formação personalizada** permite definir manualmente:
- de 2 a 5 defensores;
- de 1 a 6 meio-campistas;
- de 1 a 5 atacantes.

Os três setores precisam somar exatamente 10 jogadores de linha. O goleiro é sempre o 11º jogador.

Exemplos válidos:
- personalizada 4-2-4;
- personalizada 3-3-4;
- personalizada 5-2-3;
- personalizada 2-5-3.

O jogo verifica se o elenco saudável possui jogadores suficientes em cada setor antes de aplicar a formação.

### Escalação

Os recursos **Usar os melhores**, **Priorizar descansados**, troca de jogadores, salvamento normal e salvamento manual funcionam também com as novas formações e com a formação personalizada.

A escalação passa a respeitar exatamente o número de jogadores de cada setor da formação escolhida. O sistema não completa mais uma posição em falta usando um jogador de outro setor apenas para chegar a 11.


## Dois patrocinadores + marcas reais — v29

O sistema de patrocínios foi ampliado.

Agora cada clube pode manter **até dois contratos de patrocínio ativos ao mesmo tempo**.

### Mais opções de patrocínio

O catálogo passa a incluir marcas reais de diferentes setores, usadas apenas dentro da simulação do jogo.

Casas de apostas:
- Betano
- Superbet
- Betnacional
- Sportingbet

Material esportivo:
- Nike
- Adidas
- Puma

Bancos e finanças:
- Nubank
- Itaú
- Santander

Tecnologia, varejo e serviços:
- Mercado Livre
- Amazon
- Samsung
- iFood
- Shopee

Telecom:
- Vivo
- Claro
- TIM

Outros setores:
- Coca-Cola
- BYD

### Funcionamento

- o clube pode assinar com um primeiro patrocinador e continuar recebendo propostas para preencher o segundo espaço;
- não é possível assinar duas vezes com a mesma marca ao mesmo tempo;
- quando os dois espaços estiverem ocupados, novas assinaturas ficam bloqueadas;
- quando um contrato terminar, a vaga correspondente volta a ficar disponível;
- os dois patrocinadores pagam suas respectivas parcelas mensais;
- as luvas de assinatura de cada contrato são pagas separadamente;
- os valores das propostas aumentam conforme a divisão do clube;
- os contratos continuam tendo duração de 12 meses.

A interface mostra:
- quantidade de contratos ativos, de 0/2 até 2/2;
- valor mensal de cada patrocinador;
- meses restantes;
- setor da marca;
- número de vagas livres;
- todas as propostas disponíveis.

Os nomes das marcas são usados apenas como parte da simulação do jogo. O projeto não afirma vínculo, parceria ou patrocínio real com nenhuma dessas empresas.


## Menos coletivas de imprensa — v30

A frequência das coletivas foi reduzida.

Agora elas aparecem principalmente em situações realmente importantes:

- após uma eliminação;
- após uma final ou outro jogo decisivo;
- na última rodada da liga quando o jogo é tratado como decisivo;
- depois de uma goleada muito fora do normal.

As goleadas comuns continuam aparecendo no jornal e podem gerar mensagens da diretoria, mas não obrigatoriamente uma coletiva.

Critério mais restrito para goleadas com coletiva:
- derrota por diferença de 4 gols ou mais;
- vitória por diferença de 5 gols ou mais.

Além disso, coletivas que não sejam de eliminação ficam limitadas a **3 por temporada**.

As coletivas de eliminação não entram nesse limite, para que uma queda importante de competição continue tendo repercussão.


## Jogadores lesionados visíveis — v31

Foi adicionado um painel específico de **Departamento Médico**.

Agora os jogadores lesionados aparecem claramente em:
- **Início**;
- **Titulares**;
- **Elenco**.

Para cada lesionado, o jogo mostra:
- nome;
- posição;
- overall;
- se era titular;
- físico;
- moral;
- quantidade de jogos restantes da lesão;
- previsão de retorno em jogos.

Quando não houver ninguém lesionado, o jogo informa que todo o elenco está disponível.


## Rodízio realista + propostas por grande fase — v32

### Rodízio de elenco mais realista

O botão de rodízio deixou de simplesmente escolher os jogadores com melhor combinação de overall e físico.

Agora a sugestão considera:
- físico atual;
- número de jogos consecutivos como titular;
- overall;
- moral;
- qualidade e condição física do reserva da mesma posição;
- importância da próxima partida.

O comportamento muda conforme o contexto:

**Jogo decisivo**
- finais, fases decisivas continentais e reta final da liga;
- o jogo preserva mais os melhores titulares;
- normalmente faz no máximo 2 trocas;
- só poupa um jogador importante quando o desgaste realmente justifica.

**Jogo normal**
- equilíbrio entre força e descanso;
- pode fazer até 4 trocas.

**Jogo mais adequado para rotação**
- começo de temporada e fases iniciais menos críticas;
- pode fazer até 5 trocas;
- jogadores com muitos jogos seguidos passam a ter prioridade para descanso.

Goleiros são tratados de forma diferente: o titular só é poupado por desgaste forte ou sequência excepcionalmente longa.

O jogo também passa a registrar **jogos consecutivos como titular**. Essa carga aparece nos cards dos jogadores e é zerada quando o atleta descansa ou quando uma nova temporada começa.

Após usar o rodízio, a interface mostra um **Plano de Rodízio**, explicando:
- contexto da próxima partida;
- quem será poupado;
- quem entra;
- motivo da troca, como físico baixo, desgaste acumulado ou muitos jogos seguidos.

### Propostas quando o time está em grande fase

O mercado agora acompanha o desempenho recente do clube.

O jogo calcula um **índice de desempenho de 0 a 100** usando:
- últimos 8 jogos;
- vitórias e empates;
- saldo de gols;
- posição na tabela;
- títulos conquistados na temporada.

A partir de uma grande fase:
- outros clubes passam a procurar seus jogadores com mais frequência;
- titulares e atletas com muitos gols/assistências chamam mais atenção;
- jogadores de maior overall também atraem mais interesse;
- as ofertas recebem um pequeno prêmio de valorização pela boa fase, sem criar valores exagerados;
- em uma fase excepcional, podem surgir até 2 novas propostas de uma vez;
- clubes estrangeiros também podem demonstrar interesse quando a campanha estiver em nível muito alto.

O Mercado mostra o status da equipe como:
- Momento normal;
- Boa fase;
- Grande fase;
- Fase excelente.

As propostas continuam sendo pelos **jogadores do elenco**, preservando o sistema atual de carreira de clube.
