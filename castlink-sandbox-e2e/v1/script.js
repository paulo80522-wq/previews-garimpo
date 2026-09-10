/**
 * CastLink — SANDBOX E2E (v1)
 * Script Funcional de Interatividade do Cliente
 * Ambiente: 100% ISOLADO / SANDBOX
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('[SANDBOX E2E] Inicializando scripts funcionais de CastLink Sandbox v1...');

  // 1. Controle de Navegação Mobile
  const navToggle = document.getElementById('mobile-nav-toggle');
  const mainNav = document.getElementById('main-nav');

  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', !isExpanded);
      mainNav.classList.toggle('active');
    });
  }

  // 2. Fechar navegação mobile ao clicar em um link interno
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (mainNav && mainNav.classList.contains('active')) {
        mainNav.classList.remove('active');
        if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  });

  // 3. Mecanismo de Formulário de Teste / Contato (Sandbox)
  const contactForm = document.getElementById('test-contact-form');
  const formStatus = document.getElementById('form-status');

  if (contactForm && formStatus) {
    contactForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const nameInput = document.getElementById('contact-name');
      const emailInput = document.getElementById('contact-email');
      const messageInput = document.getElementById('contact-message');

      const name = nameInput ? nameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';
      const message = messageInput ? messageInput.value.trim() : '';

      if (!name || !email || !message) {
        formStatus.className = 'form-status error';
        formStatus.textContent = 'Por favor, preencha todos os campos obrigatórios do teste.';
        return;
      }

      // Validação sintática simples de e-mail
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        formStatus.className = 'form-status error';
        formStatus.textContent = 'Por favor, insira um e-mail com formato válido.';
        return;
      }

      // Confirmação de teste em sandbox (sem chamada de rede real)
      formStatus.className = 'form-status success';
      formStatus.textContent = `[SANDBOX HOMOLOGADO] Mensagem de teste simulada com sucesso para "${name}" (${email})! Nenhum e-mail real foi transmitido.`;
      
      console.log('[SANDBOX E2E] Evento de formulário processado com sucesso:', {
        name,
        email,
        timestamp: new Date().toISOString(),
        environment: 'SANDBOX_ISOLATED'
      });

      contactForm.reset();
    });
  }

  console.log('[SANDBOX E2E] Pronto e operacional sem erros.');
});
