/** "functionalStrengthTraining" becomes "Functional strength training". */
export const prettyActivity = (name: string | undefined): string => {
  const words = (name ?? 'workout')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : 'Workout';
};
