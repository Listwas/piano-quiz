// Use the native field for form state and sizing, with a themed modal for the options.
export function installChoicePicker() {
  const dialog = document.getElementById('choice-dialog');
  const title = document.getElementById('choice-title');
  const options = document.getElementById('choice-options');
  let trigger;
  const observer = new ResizeObserver(entries => {
    for (const { target } of entries) {
      target.nextElementSibling.hidden = target.disabled || !target.getClientRects().length;
    }
  });

  for (const select of document.querySelectorAll('select')) {
    const labels = [...select.labels];
    const labelText = labels.map(label => {
      const copy = label.cloneNode(true);
      copy.querySelector('select')?.remove();
      return copy.textContent.trim();
    }).join(' ');
    const name = select.getAttribute('aria-label') || labelText || 'Choose an option';
    const wrapper = document.createElement('span');
    wrapper.className = 'choice-field';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-trigger';
    button.hidden = true;
    button.setAttribute('aria-haspopup', 'dialog');

    const describe = () => {
      const value = select.selectedOptions[0]?.label;
      button.setAttribute('aria-label', value ? `${name}, ${value}` : name);
      button.hidden = select.disabled || !select.getClientRects().length;
    };

    select.before(wrapper);
    wrapper.append(select, button);
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    button.id = `${select.id}-choices`;
    for (const label of labels) label.htmlFor = button.id;
    observer.observe(select);
    new MutationObserver(describe).observe(select, { childList: true, subtree: true, attributes: true, characterData: true });
    select.addEventListener('change', describe);
    button.addEventListener('focus', describe);
    describe();

    button.addEventListener('click', () => {
      trigger = button;
      title.textContent = name;
      const choices = Array.from(select.options).filter(option => !option.hidden).map(option => {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'choice-option';
        choice.textContent = option.label;
        choice.disabled = option.disabled;
        choice.setAttribute('aria-pressed', String(option.selected));
        choice.addEventListener('click', () => {
          dialog.close();
          if (select.selectedIndex === option.index) return;
          select.selectedIndex = option.index;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        return choice;
      });
      options.replaceChildren(...choices);
      dialog.showModal();
      (choices.find(choice => choice.getAttribute('aria-pressed') === 'true' && !choice.disabled) ??
        choices.find(choice => !choice.disabled))?.focus();
    });
  }

  options.addEventListener('keydown', event => {
    const choices = [...options.querySelectorAll('button:enabled')];
    const index = choices.indexOf(document.activeElement);
    const target = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: choices.length - 1 }[event.key];
    if (target === undefined || !choices.length) return;
    event.preventDefault();
    choices[(target + choices.length) % choices.length].focus();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    dialog.close();
  });
  dialog.addEventListener('close', () => trigger?.focus({ preventScroll: true }));
}
