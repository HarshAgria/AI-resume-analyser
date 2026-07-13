import React from "react";

const SideLottie = ({ src, position = "left" }) => {
  return (
    <div
      className={`hidden lg:block fixed top-0 h-full w-[280px] z-0 
      ${position === "left" ? "left-0" : "right-0"}`}
    >
      <iframe
        src={src}
        className="w-full h-full"
        frameBorder="0"
        allow="autoplay; fullscreen"
      />
    </div>
  );
};

export default SideLottie;