interface FulfillmentInstructionsProps {
  instructions?: string | null;
}

/** Customer-facing directions for claiming an add-on separately from admission. */
export default function FulfillmentInstructions({
  instructions,
}: FulfillmentInstructionsProps) {
  const content = instructions?.trim();
  if (!content) return null;

  return (
    <div className="mt-3 rounded-lg border border-[#e4dcf4] bg-white px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6b5b8a]">
        Fulfillment instructions
      </p>
      <p className="mt-1 whitespace-pre-line text-xs leading-5 text-gray-700">{content}</p>
    </div>
  );
}
