// Anamnese Olhar — questionário para pais ou responsáveis.
// Instrumento próprio do Instituto Olhar: estrutura de anamnese do desenvolvimento
// + checklist de sinais e sintomas com escala de frequência de 5 pontos (0–4).
//
// IMPORTANTE: é um instrumento clínico de triagem e organização da queixa.
// NÃO é o COVD-QOL e não foi validado: o app mostra pontuação por domínio de
// forma descritiva e NÃO aplica ponto de corte.
//
// Este arquivo é carregado tanto pelo formulário dos pais (/anamnese/) quanto
// pelo app (aba Anamnese). Mudar o texto de um item não muda o seu id.
(function () {
  'use strict';

  const yn = (id, label, opts) => Object.assign({ id, type: 'yesno', label }, opts || {});
  const ynd = (id, label) => ({ id, type: 'yesno', label, describe: true });

  window.ANAMNESE_SCHEMA = {
    id: 'anamnese-olhar',
    version: 1,
    title: 'Questionário de desenvolvimento e visão',
    subtitle: 'Para pais ou responsáveis',

    // Escala do checklist de sinais e sintomas
    scale: [
      { v: 0, label: 'Nunca' },
      { v: 1, label: 'Raramente' },
      { v: 2, label: 'Às vezes' },
      { v: 3, label: 'Frequentemente' },
      { v: 4, label: 'Sempre' },
    ],

    sections: [
      {
        id: 's0', title: 'Antes de começar',
        intro: 'Quanto mais informações tivermos sobre a criança, melhor poderemos ajudar. Responda com calma. Se alguma pergunta não se aplicar ou gerar dúvida, deixe em branco ou escreva sua dúvida: conversaremos na consulta. Suas respostas ficam salvas neste aparelho até você enviar.',
        fields: [
          { id: 'respondente', type: 'text', label: 'Seu nome (quem está preenchendo)', required: true },
          { id: 'parentesco', type: 'choice', label: 'Sua relação com a criança', options: ['Mãe', 'Pai', 'Avó/Avô', 'Responsável legal', 'Outro'] },
          { id: 'consentimento', type: 'consent', required: true,
            label: 'Autorizo o Instituto Olhar a registrar e usar estas informações, inclusive dados de saúde da criança, exclusivamente para a avaliação e o acompanhamento visual dela, com sigilo profissional e conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018). Sei que posso pedir acesso, correção ou exclusão dos dados a qualquer momento.' },
        ],
      },
      {
        id: 's1', title: '1. Identificação',
        fields: [
          { id: 'crianca_nome', type: 'text', label: 'Nome completo da criança', required: true },
          { id: 'crianca_nasc', type: 'date', label: 'Data de nascimento', required: true },
          { id: 'crianca_sexo', type: 'choice', label: 'Sexo', options: ['Feminino', 'Masculino'] },
          { id: 'mae_nome', type: 'text', label: 'Nome da mãe' },
          { id: 'mae_prof', type: 'text', label: 'Profissão da mãe' },
          { id: 'mae_fone', type: 'tel', label: 'Telefone da mãe' },
          { id: 'mae_email', type: 'email', label: 'E-mail da mãe' },
          { id: 'pai_nome', type: 'text', label: 'Nome do pai' },
          { id: 'pai_prof', type: 'text', label: 'Profissão do pai' },
          { id: 'pai_fone', type: 'tel', label: 'Telefone do pai' },
          { id: 'pai_email', type: 'email', label: 'E-mail do pai' },
          { id: 'pais_relacao', type: 'choice', label: 'Situação dos pais', options: ['Casados / juntos', 'Separados', 'Outra'] },
          { id: 'vinculo', type: 'choice', label: 'Com quem a criança vive / vínculo', options: ['Pais biológicos', 'Pais adotivos', 'Mãe e padrasto', 'Pai e madrasta', 'Outro'] },
          { id: 'vinculo_outro', type: 'text', label: 'Se "outro", descreva' },
          { id: 'irmaos', type: 'textarea', label: 'Irmãos (nomes e idades)' },
          { id: 'cidade', type: 'text', label: 'Cidade / UF' },
          { id: 'escola', type: 'text', label: 'Escola atual' },
          { id: 'ano_escolar', type: 'text', label: 'Ano escolar' },
          { id: 'periodo', type: 'choice', label: 'Turno', options: ['Manhã', 'Tarde', 'Integral', 'Noite'] },
        ],
      },
      {
        id: 's2', title: '2. Sobre esta avaliação',
        fields: [
          { id: 'indicacao', type: 'text', label: 'Quem indicou a avaliação?' },
          { id: 'indicacao_contato', type: 'text', label: 'Contato de quem indicou (telefone, e-mail, clínica)' },
          { id: 'motivo', type: 'textarea', label: 'Qual o principal motivo da avaliação?', required: true },
          { id: 'preocupacoes', type: 'textarea', label: 'Com suas palavras: quais são as suas principais preocupações e as dificuldades que a criança apresenta?' },
        ],
      },
      {
        id: 's3', title: '3. Gestação e desenvolvimento',
        fields: [
          { id: 'gest_intercorrencias', type: 'textarea', label: 'Houve alguma intercorrência na gravidez? Descreva.' },
          { id: 'gest_substancias', type: 'textarea', label: 'Houve uso de álcool, cigarro, outras drogas ou medicamentos na gravidez? Descreva.' },
          { id: 'parto_tipo', type: 'choice', label: 'Tipo de parto', options: ['Normal', 'Cesárea', 'Não sei'] },
          { id: 'semanas', type: 'number', label: 'Semanas de gestação ao nascer', min: 20, max: 45 },
          { id: 'peso', type: 'text', label: 'Peso ao nascer' },
          { id: 'comprimento', type: 'text', label: 'Comprimento ao nascer' },
          { id: 'apgar', type: 'text', label: 'Índice de Apgar (se souber)' },
          { id: 'parto_intercorrencias', type: 'textarea', label: 'Houve intercorrências no parto? Descreva.' },
          yn('forceps', 'Foi usado fórceps?'),
          yn('ventosa', 'Foi usada ventosa?'),
          yn('amamentado', 'Foi amamentado(a)?'),
          { id: 'amamentado_meses', type: 'number', label: 'Se sim, por quantos meses?', min: 0, max: 72 },
          { id: 'alimentacao_bebe', type: 'choice', label: 'De modo geral, a alimentação do bebê foi', options: ['Boa', 'Regular', 'Ruim'] },
          yn('rastejou', 'Rastejou (de barriga no chão)?'),
          { id: 'rastejou_meses', type: 'number', label: 'Com quantos meses rastejou?', min: 0, max: 36 },
          yn('engatinhou', 'Engatinhou (apoiado nas mãos e joelhos)?'),
          { id: 'engatinhou_meses', type: 'number', label: 'Com quantos meses engatinhou?', min: 0, max: 36 },
          { id: 'sentou', type: 'text', label: 'Com que idade sentou sem apoio?' },
          { id: 'andou_meses', type: 'number', label: 'Com quantos meses começou a andar?', min: 0, max: 60 },
          { id: 'bebe_ativo', type: 'choice', label: 'Como bebê, era ativo(a)?', options: ['Muito', 'Regular', 'Pouco'] },
          { id: 'sono_bebe', type: 'choice', label: 'Como era o sono?', options: ['Profundo', 'Regular', 'Agitado'] },
          { id: 'desfralde_dia', type: 'text', label: 'Idade do desfralde diurno' },
          { id: 'desfralde_noite', type: 'text', label: 'Idade do desfralde noturno' },
          { id: 'primeiros_sons', type: 'text', label: 'Com que idade fez os primeiros sons?' },
          { id: 'primeiras_palavras', type: 'text', label: 'Quando falou as primeiras palavras, e quais foram?' },
          { id: 'primeiras_frases', type: 'text', label: 'Com que idade falou as primeiras frases?' },
          { id: 'atraso', type: 'textarea', label: 'Há atraso no desenvolvimento? Se sim, quais foram os primeiros sinais e em que idade apareceram?' },
          { id: 'diagnosticos', type: 'textarea', label: 'A criança já recebeu algum diagnóstico? Quais e quando?' },
        ],
      },
      {
        id: 's4', title: '4. Escola',
        fields: [
          { id: 'inicio_bercario', type: 'text', label: 'Idade em que começou no berçário' },
          { id: 'inicio_infantil', type: 'text', label: 'Idade em que começou na educação infantil' },
          { id: 'inicio_fundamental', type: 'text', label: 'Idade em que começou no ensino fundamental' },
          ynd('repetiu', 'Já repetiu de ano? Qual?'),
          ynd('mudou_escola', 'Mudou de escola muitas vezes? Por quê?'),
          ynd('servico_especial', 'Recebe algum apoio da escola (reforço, ledor, acompanhamento psicológico ou pedagógico)?'),
          ynd('at', 'Tem acompanhante terapêutico (AT)?'),
          ynd('adaptacao', 'Tem alguma adaptação (sala de apoio, material adaptado, prova com tempo extra)?'),
          { id: 'desempenho', type: 'choice', label: 'De forma geral, o desempenho escolar tem sido', options: ['Ótimo', 'Bom', 'Regular', 'Ruim', 'Péssimo'] },
          { id: 'materia_facil', type: 'text', label: 'Matéria mais fácil para a criança' },
          { id: 'materia_dificil', type: 'text', label: 'Matéria mais difícil para a criança' },
          { id: 'fala_escola', type: 'textarea', label: 'O que a criança costuma dizer sobre a escola, as tarefas, os professores e os colegas?' },
          ynd('comportamento_escola', 'Tem problemas de comportamento na escola?'),
          yn('gosta_escola', 'Gosta da escola?'),
          yn('gosta_professores', 'Gosta dos professores?'),
          yn('escola_satisfeita', 'A escola está satisfeita com o desempenho dela?'),
          yn('voce_satisfeito', 'Você está satisfeito(a) com o desempenho escolar?'),
          yn('frequenta', 'Frequenta a escola regularmente?'),
          yn('maximo_potencial', 'Você acha que ela rende o máximo do que é capaz?'),
          yn('ano_compativel', 'Está no ano escolar esperado para a idade?'),
          yn('le_como_colegas', 'Lê tão bem quanto os colegas da turma?'),
        ],
      },
      {
        id: 's5', title: '5. Histórico familiar',
        fields: [
          ynd('fam_neuro', 'Há na família casos de transtornos mentais, deficiência intelectual, autismo, síndromes genéticas ou transtorno de processamento?'),
          ynd('fam_leitura', 'Há na família dificuldade importante para ler, escrever ou soletrar?'),
          ynd('fam_atencao', 'Há na família hiperatividade, dificuldade de atenção ou problemas de fala?'),
          ynd('fam_aprendizagem', 'Há na família dificuldade de aprendizagem ou baixo rendimento escolar?'),
        ],
      },
      {
        id: 's6', title: '6. A criança hoje',
        fields: [
          { id: 'brincar', type: 'textarea', label: 'Do que gosta de brincar? (brinquedos, brincadeiras, desenhos preferidos)' },
          { id: 'interesses', type: 'textarea', label: 'Quais são os principais interesses dela?' },
          { id: 'reacao_nao', type: 'textarea', label: 'Como costuma reagir quando ouve um "não"?' },
          ynd('tensao', 'Tem comportamentos de tensão (roer unhas, piscar ou coçar muito os olhos, birras, morder os lábios, ruídos com a boca)?'),
          ynd('esportes', 'Gosta de atividades esportivas? Quais?'),
          { id: 'avd', type: 'grid', label: 'Atividades do dia a dia',
            options: ['Sozinho(a)', 'Com alguma ajuda', 'Depende totalmente'], describe: true,
            rows: [
              { id: 'comer', label: 'Come' },
              { id: 'despir', label: 'Tira a roupa' },
              { id: 'vestir', label: 'Coloca a roupa' },
              { id: 'abotoar', label: 'Abotoa a roupa' },
              { id: 'ziper', label: 'Abre e fecha zíper' },
              { id: 'amarrar', label: 'Amarra o tênis' },
              { id: 'dentes', label: 'Escova os dentes' },
              { id: 'banho', label: 'Toma banho' },
              { id: 'banheiro', label: 'Vai ao banheiro' },
              { id: 'maos', label: 'Lava as mãos' },
            ] },
          { id: 'h_comunicacao', type: 'heading', label: 'Comunicação' },
          yn('com_compreendido', 'É compreendido(a) por pessoas de fora da família?'),
          yn('com_palavras', 'Fala palavras?'),
          yn('com_frases', 'Fala frases?'),
          yn('com_gestos', 'Usa gestos para se comunicar?'),
          yn('com_leva_mao', 'Pega o adulto pela mão para mostrar o que quer?'),
          yn('com_sorriso_choro', 'Comunica-se principalmente por sorrisos e choro?'),
          yn('com_contato_visual', 'Faz e mantém contato visual?'),
          { id: 'com_outra', type: 'text', label: 'Outra forma de comunicação? Descreva' },
          ynd('pares', 'Relaciona-se bem com crianças da mesma idade?'),
          { id: 'h_alimentacao', type: 'heading', label: 'Alimentação' },
          ynd('alim_transtorno', 'Tem algum transtorno alimentar?'),
          ynd('alim_restricao', 'Tem restrições alimentares?'),
          ynd('alim_outras', 'Há outras questões relevantes sobre alimentação?'),
          { id: 'h_comportamento', type: 'heading', label: 'Comportamento' },
          yn('comp_movimento', 'Parece estar sempre em movimento?'),
          yn('comp_sentado', 'Consegue ficar sentado(a) por bastante tempo?'),
          yn('comp_impulsivo', 'É impulsivo(a) com frequência?'),
          yn('comp_ansioso', 'Fica ansioso(a) com frequência?'),
          yn('comp_inseguro', 'Mostra-se inseguro(a) com frequência?'),
        ],
      },
      {
        id: 's7', title: '7. Saúde geral',
        intro: 'A criança tem ou já teve alguma destas situações? Se sim, descreva.',
        fields: [
          ynd('sau_febre', 'Febre alta'),
          ynd('sau_convulsao', 'Convulsão'),
          ynd('sau_desmaio', 'Desmaio'),
          ynd('sau_otite', 'Otite (infecção de ouvido)'),
          ynd('sau_asma', 'Asma'),
          ynd('sau_alergia', 'Alergia'),
          ynd('sau_intestino', 'Prisão de ventre ou diarreia frequente'),
          ynd('sau_tombo', 'Queda forte'),
          ynd('sau_cabeca', 'Pancada na cabeça'),
          ynd('sau_cirurgia', 'Cirurgia'),
          ynd('sau_fratura', 'Fratura'),
          ynd('sau_vacina', 'Reação a vacina'),
          ynd('sau_fadiga', 'Períodos de cansaço extremo'),
          ynd('sau_estereotipias', 'Estereotipias (movimentos repetitivos)'),
          ynd('sau_outras', 'Outras doenças'),
          { id: 'medicamentos', type: 'textarea', label: 'Usa algum medicamento? Quais, há quanto tempo e em que dose?' },
          { id: 'profissionais', type: 'grid2', label: 'Já foi avaliado(a) por algum destes profissionais?',
            cols: ['Já foi avaliado(a)?', 'Faz acompanhamento hoje?'],
            rows: [
              { id: 'neurologista', label: 'Neurologista' },
              { id: 'nutricionista', label: 'Nutricionista' },
              { id: 'otorrino', label: 'Otorrinolaringologista' },
              { id: 'endocrino', label: 'Endocrinologista' },
              { id: 'oftalmologista', label: 'Oftalmologista' },
              { id: 'ortoptista', label: 'Ortoptista' },
              { id: 'psicologo', label: 'Psicólogo(a)' },
              { id: 'neuropsicologo', label: 'Neuropsicólogo(a)' },
              { id: 'fono', label: 'Fonoaudiólogo(a)' },
              { id: 'pac', label: 'Processamento auditivo (PAC)' },
              { id: 'to', label: 'Terapeuta ocupacional' },
              { id: 'fisio', label: 'Fisioterapeuta' },
              { id: 'psicopedagogo', label: 'Psicopedagogo(a)' },
              { id: 'psicomotricista', label: 'Psicomotricista' },
            ] },
          { id: 'profissionais_outros', type: 'textarea', label: 'Outros profissionais (descreva)' },
        ],
      },
      {
        id: 's8', title: '8. Histórico visual',
        fields: [
          yn('vis_exame_previo', 'Já fez exame de vista antes?'),
          { id: 'vis_primeira_idade', type: 'text', label: 'Se sim, com que idade foi o primeiro?' },
          yn('vis_alteracao', 'Foi encontrada alguma alteração?'),
          { id: 'vis_ultima', type: 'text', label: 'Quando foi a última avaliação?' },
          { id: 'vis_prescricoes', type: 'multi', label: 'Já foi indicado(a):', options: ['Óculos', 'Lentes de contato', 'Ortóptica', 'Terapia visual', 'Tampão', 'Exames especiais', 'Cirurgia ocular', 'Outro'] },
          { id: 'vis_detalhes', type: 'textarea', label: 'Detalhes (graus, tempo de uso, resultados)' },
          { id: 'vis_frequencia', type: 'text', label: 'Com que frequência faz acompanhamento visual?' },
          ynd('vis_mesmo_profissional', 'Costuma consultar sempre o(a) mesmo(a) profissional? Quem?'),
          { id: 'vis_familia', type: 'textarea', label: 'Histórico visual da família (óculos, ceratocone, estrabismo, "olho preguiçoso", doenças ou cirurgias oculares)' },
        ],
      },
      {
        id: 's9', title: '9. Sinais e sintomas',
        intro: 'Marque com que frequência a criança apresenta cada situação. Pense nas últimas semanas, em casa e na escola.',
        askNote: 'Os itens marcados com “Pergunte à criança” falam do que ela sente ou enxerga, e só ela pode contar. Escolha um momento tranquilo, pergunte com calma e com palavras simples (por exemplo: “Quando você lê, as letras ficam paradas ou parecem se mexer?”), sem sugerir a resposta e sem pressa. Não há resposta certa nem errada. Se ela não souber responder ou for pequena demais, marque pelo que você observa no dia a dia.',
        fields: [
          { id: 'sintomas', type: 'scale', items: [
            { n: 1, t: 'Parece tenso(a) ou pressionado(a) com as tarefas da escola' },
            { n: 2, t: 'Entende pouco do que lê' },
            { n: 3, t: 'Esquece o que acabou de ler e precisa reler' },
            { n: 4, t: 'Evita ler' },
            { n: 5, t: 'Prefere que alguém leia para ele(a)' },
            { n: 6, t: 'Vai melhor respondendo oralmente do que por escrito' },
            { n: 7, t: 'Inclina ou gira a cabeça ao ler ou fazer atividades de perto' },
            { n: 8, t: 'Inclina ou gira a cabeça ao escrever ou desenhar' },
            { n: 9, t: 'Pisca muito' },
            { n: 10, t: 'Fica com os olhos vermelhos' },
            { n: 11, t: 'Reclama de desconforto nos olhos (lacrimejamento, ardor, coceira)', ask: true },
            { n: 12, t: 'Incomoda-se com a luz, do sol ou artificial', ask: true },
            { n: 13, t: 'Não consegue terminar as tarefas no tempo esperado' },
            { n: 14, t: 'Aperta os olhos ou franze a testa para enxergar' },
            { n: 15, t: 'Mexe os lábios ou sussurra quando lê em silêncio' },
            { n: 16, t: 'Inverte ou espelha letras e sílabas ao ler ou escrever (b/d, "ave"/"eva")' },
            { n: 17, t: 'Troca a ordem dos números (12 por 21)' },
            { n: 18, t: 'Desalinha números ou colunas ao fazer contas' },
            { n: 19, t: 'Mexe a cabeça, em vez dos olhos, ao ler ou fazer atividades de perto' },
            { n: 20, t: 'Deixa passar detalhes pequenos (letras, sinais de + e −)' },
            { n: 21, t: 'Perde a concentração ao ler ou fazer atividades de perto' },
            { n: 22, t: 'Perde-se no texto ou na atividade de perto' },
            { n: 23, t: 'Precisa acompanhar a leitura com o dedo' },
            { n: 24, t: 'Pula ou repete linhas ao ler' },
            { n: 25, t: 'Lê mais devagar do que o esperado para a idade ou o ano escolar' },
            { n: 26, t: 'Tem dificuldade de equilíbrio, parado(a) ou em movimento' },
            { n: 27, t: 'Fecha ou tampa um olho, ou deita sobre a mesa, ao ler' },
            { n: 28, t: 'Segura livro, celular, tablet ou videogame muito perto dos olhos' },
            { n: 29, t: 'Parece desajeitado(a): esbarra, derruba ou tropeça nas coisas' },
            { n: 30, t: 'Diz que vê dobrado', ask: true },
            { n: 31, t: 'Diz que os olhos "pulam" ou tremem ao ler ou fazer atividades de perto', ask: true },
            { n: 32, t: 'Tem dificuldade para copiar, do livro ou do quadro' },
            { n: 33, t: 'Tem dificuldade para calcular distâncias' },
            { n: 34, t: 'Tem dor de cabeça ao ler ou fazer atividades de perto', ask: true },
            { n: 35, t: 'Enjoa ou fica tonto(a) em carro, ônibus ou outro transporte', ask: true },
            { n: 36, t: 'Tem postura ruim ao ler, escrever ou estudar' },
            { n: 37, t: 'Diz que as letras se mexem, pulam, flutuam ou se misturam', ask: true },
            { n: 38, t: 'Tem medo de altura ou de brinquedos de escalar' },
            { n: 39, t: 'Distrai-se fácil ou mantém a atenção por pouco tempo ao ler ou estudar' },
            { n: 40, t: 'Fica cansado(a) ao ler ou fazer atividades de perto' },
            { n: 41, t: 'Fica sonolento(a) ao ler ou fazer atividades de perto' },
            { n: 42, t: 'Sente dor nos olhos ao ler ou fazer atividades de perto', ask: true },
            { n: 43, t: 'Vê as letras embaçadas ou "entrando e saindo de foco" de perto', ask: true },
            { n: 44, t: 'Tem dificuldade para contar dinheiro ou troco' },
            { n: 45, t: 'Escreve subindo ou descendo da linha' },
            { n: 46, t: 'Tem letra ou traçado de desenho abaixo do esperado para a idade' },
            { n: 47, t: 'A letra muda muito de tamanho, formato ou qualidade' },
            { n: 48, t: 'Escreve ou desenha com capricho, mas muito devagar' },
            { n: 49, t: 'Tem dificuldade com ditado' },
            { n: 50, t: 'Tem dificuldade com atividades manuais (tesoura, ferramentas, quebra-cabeça)' },
            { n: 51, t: 'Tem dificuldade para pegar, rebater ou chutar bola' },
            { n: 52, t: 'Tem dificuldade ou desempenho baixo em esportes' },
            { n: 53, t: 'Tem dificuldade ou medo de subir ou descer escadas, comuns ou rolantes' },
            { n: 54, t: 'Tem dificuldade para usar os dois lados do corpo ao mesmo tempo' },
            { n: 55, t: 'Perde as próprias coisas com frequência' },
            { n: 56, t: 'Confunde direita e esquerda, em cima e embaixo, ou se orienta mal no espaço' },
            { n: 57, t: 'Vê embaçado de longe (quadro, televisão, placas)', ask: true },
            { n: 58, t: 'Demora para focar quando olha do caderno para o quadro, ou do quadro para o caderno', ask: true },
            { n: 59, t: 'Esfrega os olhos durante ou depois de atividades de perto' },
            { n: 60, t: 'Reclama que a visão piora no fim do dia ou depois de muito tempo de tela', ask: true },
          ] },
          { id: 'impacto', type: 'choice', label: 'No geral, quanto essas dificuldades atrapalham o dia a dia da criança?',
            options: ['Nada', 'Pouco', 'Moderadamente', 'Muito', 'Extremamente'] },
        ],
      },
      {
        id: 's10', title: '10. Para terminar',
        fields: [
          { id: 'outras_informacoes', type: 'textarea', label: 'Há mais alguma informação importante que não foi perguntada?' },
        ],
      },
    ],

    // Domínios do checklist (agrupamento clínico do Instituto Olhar — revisável).
    // Cada item pertence a um só domínio. O app relaciona cada domínio ao teste que o investiga.
    domains: [
      { id: 'leitura', label: 'Leitura e eficiência', items: [2, 3, 4, 5, 6, 13, 15, 25], tests: 'DEM' },
      { id: 'oculomotor', label: 'Oculomotor', items: [19, 20, 22, 23, 24, 31, 37], tests: 'NSUCO, DEM' },
      { id: 'binocular', label: 'Binocular e acomodação', items: [9, 10, 11, 21, 27, 28, 30, 34, 40, 41, 42, 43, 58, 59, 60], tests: 'Vergência e Acomodação, Visão binocular' },
      { id: 'refracao', label: 'Nitidez (refração)', items: [14, 57], tests: 'Refração, acuidade' },
      { id: 'percepcao', label: 'Percepção visual e visuoespacial', items: [16, 17, 18, 33, 44, 55, 56], tests: 'TVPS-4, DTVP-3 (percepção)' },
      { id: 'visuomotor', label: 'Visuomotor e escrita', items: [8, 32, 45, 46, 47, 48, 49, 50], tests: 'DTVP-3 (integração visuomotora)' },
      { id: 'motor', label: 'Motor, equilíbrio e bilateralidade', items: [26, 29, 35, 38, 51, 52, 53, 54], tests: 'Encaminhamento (TO, fisioterapia)' },
      { id: 'conforto', label: 'Comportamento, postura e conforto', items: [1, 7, 12, 36, 39], tests: 'Contexto clínico' },
    ],

    // Respostas que o app destaca como alerta para o perfil do paciente (Passo 0).
    flags: [
      { field: 'semanas', test: (v) => v !== '' && v != null && Number(v) < 37, label: 'Nascimento antes de 37 semanas' },
      { field: 'sau_convulsao', test: (v) => v === 'sim', label: 'Histórico de convulsão' },
      { field: 'sau_cabeca', test: (v) => v === 'sim', label: 'Pancada na cabeça' },
      { field: 'sau_desmaio', test: (v) => v === 'sim', label: 'Desmaio' },
      { field: 'atraso', test: (v) => !!(v && String(v).trim()), label: 'Atraso no desenvolvimento relatado' },
      { field: 'diagnosticos', test: (v) => !!(v && String(v).trim()), label: 'Diagnóstico prévio relatado' },
      { field: 'medicamentos', test: (v) => !!(v && String(v).trim()), label: 'Uso de medicamento' },
    ],
  };

  // Pontuação descritiva por domínio. Sem ponto de corte (instrumento não validado).
  window.ANAMNESE_SCORE = function (answers) {
    const S = window.ANAMNESE_SCHEMA;
    const sint = (answers && answers.sintomas) || {};
    const out = { domains: [], answered: 0, total: 0, flags: [] };
    S.domains.forEach((d) => {
      let sum = 0, n = 0, high = 0;
      d.items.forEach((i) => {
        const v = sint[i];
        if (v === undefined || v === null || v === '') return;
        const x = Number(v);
        if (!Number.isFinite(x)) return;
        sum += x; n++; if (x >= 3) high++;
      });
      out.answered += n; out.total += d.items.length;
      out.domains.push({
        id: d.id, label: d.label, tests: d.tests,
        items: d.items.length, answered: n, sum, max: n * 4,
        pct: n ? Math.round((sum / (n * 4)) * 100) : null,
        high,
      });
    });
    S.flags.forEach((f) => { if (answers && f.test(answers[f.field])) out.flags.push(f.label); });
    return out;
  };
})();
