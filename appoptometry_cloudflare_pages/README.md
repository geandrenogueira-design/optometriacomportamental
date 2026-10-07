# Optometria comportamental — app clínico (Instituto Olhar)

App clínico de optometria comportamental: TVPS-4, DTVP-3, DEM, NSUCO, vergência e acomodação, visão binocular e painel integrado.

- **Hospedagem:** Cloudflare Pages (pasta `public/`).
- **Login:** próprio do app (e-mail e senha), sem Cloudflare Access e sem cartão de crédito. Senha guardada com PBKDF2, sessão em cookie seguro de 8 h, bloqueio progressivo após senhas erradas.
- **Dados na nuvem:** banco D1, uma linha por paciente, com histórico diário guardado por 30 dias.
- **Offline:** tudo fica salvo no navegador (localStorage) e sincroniza quando há internet.
- **Backup manual:** botões **Exportar JSON** e **Importar JSON** no menu lateral.
- **Fluxo por etapas:** menu organizado pelo protocolo (Paciente → Entrada → Processamento central → Saída → Resultado), barra do paciente com idade e progresso, salvamento automático, botões −/+ nas listas numéricas, "não testado / não colaborou" por bloco, aba de acuidade e refração, relatório para imprimir ou salvar em PDF e menu em gaveta no celular (`public/ux.js`).
- **Anamnese pelos pais:** formulário público em `/anamnese/?c=CÓDIGO`. Os pais preenchem pelo celular e o clínico importa as respostas na aba **Anamnese (pais)**.

```
public/                     app estático (index.html, ui.js, clinicalEngine.js, normas)
public/anamnese/            formulário dos pais (index.html) e definição das perguntas (schema.js)
public/anamnese_admin.js    aba "Anamnese (pais)" do app
public/ux.js                fluxo por etapas, salvamento automático, relatório e navegação
functions/api/auth/         login: status, setup (primeira conta), login, logout
functions/api/user-data.js  sincronização dos pacientes (exige login)
functions/api/migrate-kv.js migração única do KV da versão anterior (protegida, só leitura)
functions/api/anamnese/     submit.js (pública: só recebe envios) e admin.js (protegida)
lib/auth.js                 senhas, sessão e bloqueio, usados pelas rotas protegidas
schema.sql                  tabelas do banco D1
```

---

## Configuração no Cloudflare (uma vez)

### 1. Banco D1
1. No painel, abra **Storage & Databases → D1 → Create database** e dê o nome `appoptometry`.
2. Abra o banco, vá em **Console**, cole o conteúdo de `schema.sql` e clique em **Execute**. O arquivo cria 6 tabelas: user_meta, patients, patients_history, anamnese, users e login_attempts. Pode executar de novo quando o arquivo ganhar tabelas novas: os comandos não apagam o que já existe.

### 2. Projeto Pages
Use o projeto Pages que já está ligado a este repositório. Confira em **Settings → Builds**:
- Root directory: `appoptometry_cloudflare_pages`
- Build command: *(vazio)*
- Build output directory: `public`

Depois, em **Settings → Bindings**:
- **Add → D1 database**, com Variable name `DB` e Database `appoptometry`. Faça para *Production* e *Preview*.
- **Mantenha** o KV `OPTO_KV` da versão anterior até terminar a migração (seção abaixo). Depois ele pode ser removido.

### 3. Chave secreta (AUTH_SECRET)
1. Gere um texto aleatório longo, com **pelo menos 32 caracteres**, e guarde-o num lugar seguro (por exemplo, no gerenciador de senhas).
2. Em **Workers & Pages → optometriacomportamental → Settings → Variables and Secrets**, clique em **Add**:
   - Type: **Secret** (não "Text")
   - Variable name: `AUTH_SECRET`
   - Value: o texto gerado, colado **sem aspas**
3. Salve e vá em **Deployments → Retry deployment** (ou faça o merge, que publica de novo).

Essa chave assina as sessões e é pedida **uma única vez**, no primeiro acesso, como "chave de instalação" para criar a sua conta. Se ela for trocada, todas as sessões abertas caem e é preciso entrar de novo.

### 4. Primeiro acesso
1. Abra `https://optometriacomportamental.pages.dev`. Aparece a tela **Criar a conta de acesso**.
2. Informe o e-mail, a senha (mínimo de 10 caracteres, duas vezes) e a chave de instalação (o valor de `AUTH_SECRET`).
3. Depois que a conta existe, essa tela não aparece mais: só a de **Entrar**. Ninguém consegue criar outra conta sem a chave.

### 5. Teste
1. No cartão **Nuvem e backup**, confira se aparece o seu e-mail e o status "ok".
2. Cadastre um paciente fictício. O status deve passar para "ok — salvo na nuvem".
3. Abra o app em outro aparelho, entre com o mesmo e-mail e senha e confira se o paciente aparece.

---

## Anamnese preenchida pelos pais

1. No app, selecione o paciente (opcional), abra a aba **Anamnese (pais)**, confira o nome da criança e clique em **Gerar link**. O link vale 14 dias por padrão.
2. Clique em **Copiar mensagem para WhatsApp** ou em **Abrir no WhatsApp** e envie aos pais.
3. Os pais preenchem pelo celular. As respostas ficam salvas no aparelho deles até o envio, e cada link aceita um único envio.
4. Quando o status mudar para **Respondida**, clique em **Importar**. As respostas vão para o paciente: o vinculado ao link, o selecionado, um de mesmo nome e nascimento ou um paciente novo. O motivo da consulta preenche o Perfil, se ele estiver vazio.
5. O resumo mostra os alertas (prematuridade, convulsão etc.), a pontuação por domínio, os itens marcados como frequentes ou sempre e todas as respostas.

Se o envio falhar, os pais podem **baixar uma cópia** das respostas e mandar pelo WhatsApp. No app, use **Importar arquivo de respostas (.json)**.

**Sobre o questionário:** é o instrumento próprio do Instituto Olhar. Reúne a anamnese do desenvolvimento e um checklist de 60 sinais e sintomas, com escala de frequência de 0 a 4, organizado em 8 domínios. Os domínios ficam em `public/anamnese/schema.js`, onde os itens podem ser movidos de um domínio para outro. **Não é o COVD-QOL e não foi validado.** Por isso o app mostra a pontuação de forma descritiva, sem ponto de corte.

---

## Migração dos dados da versão anterior (chave de sync)

A versão anterior guardava os pacientes no navegador e, quando você clicava em "Enviar para a nuvem", no KV `OPTO_KV`, sob a sua chave de sync. A nova versão traz os dois automaticamente:

1. **Dados no navegador:** como o endereço continua o mesmo, ao abrir a nova versão num aparelho que já usava o app e fazer login, os pacientes desse aparelho sobem para a nuvem sozinhos na primeira vez. O app avisa com uma mensagem.
2. **Dados no KV:** no cartão **Nuvem e backup**, clique em **Trazer dados da versão anterior** e confirme a chave de sync. O app preenche a chave sozinho se ela estava salva no aparelho. Só entram os pacientes que ainda não existem; os que já estão no app não são alterados.
3. Abra o app num segundo aparelho e confira os pacientes. Só então remova o binding `OPTO_KV`.

**Por segurança, antes de publicar a nova versão:** abra a versão atual, clique em **Baixar da nuvem** e depois **Enviar para a nuvem**. Faça também uma cópia pelo console (F12 → Console):

```js
(()=>{const p=JSON.parse(localStorage.getItem('optometry_app_v4_3_patients')||'[]');const b=new Blob([JSON.stringify({schemaVersion:1,updatedAt:Date.now(),patients:p},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='backup-versao-anterior.json';a.click();console.log(p.length+' pacientes exportados');})()
```

Esse arquivo pode ser carregado depois em **Importar JSON**.

---

## Proteções da sincronização

- **Um aparelho desatualizado ou vazio não apaga a nuvem.** Se a nuvem tiver uma versão mais nova, a API responde 409 e o app baixa a versão da nuvem em vez de sobrescrevê-la.
- **Histórico de 30 dias.** A cada dia em que um paciente é alterado, uma cópia dele vai para a tabela `patients_history`. Para recuperar um registro, consulte essa tabela no Console do D1:

  ```sql
  SELECT day, data FROM patients_history WHERE id = 'p_...' ORDER BY day DESC;
  ```

- **Rodando localmente** (`python -m http.server` ou `file://`), o app funciona só com o armazenamento do navegador, sem nuvem.
