exports.format = strings => {
  const source = strings.join('').trim();
  const lines = source.split('\n');

  if (lines.length === 1) {
    return source;
  }

  const space = lines[lines.length - 1].match(/\s+/)[0];
  const exp = new RegExp(`${space}`, 'g');

  return source.replace(exp, '');
};
