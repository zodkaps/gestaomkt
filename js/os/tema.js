// O tema escolhido, antes de pintar a página: sem isto o os.html piscaria
// claro ao abrir no escuro. Script comum (não módulo) e em arquivo próprio —
// a política de conteúdo da página (CSP) não deixa rodar script escrito
// dentro do HTML. Quem decide de verdade é o js/os/inicio.js, que lê a escolha
// do site; aqui só se repete a última, guardada no localStorage.
try {
  var t = localStorage.getItem("os-tema");
  if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
} catch (e) { /* sem armazenamento: abre no claro */ }
