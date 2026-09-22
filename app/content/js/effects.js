(function () {
    "use strict";

    function shuffle(input) {
        const array = input.slice();
        for (let i = array.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function restartAnimation(element, animationName) {
        if (!element) return;
        element.style.animation = "none";
        void element.offsetHeight;
        element.style.animation = animationName;
    }

    function shake(element) {
        restartAnimation(element, "shakeError 0.45s ease");
    }

    function animateScore(element, start, end) {
        if (!element) return;
        let current = start;
        element.style.transform = "scale(1.45)";
        element.style.color = "#ffd43b";

        const timer = setInterval(() => {
            current += 1;
            element.textContent = String(current);
            if (current >= end) {
                clearInterval(timer);
                setTimeout(() => {
                    element.style.transform = "scale(1)";
                    element.style.color = "";
                }, 120);
            }
        }, 25);
    }

    function fireConfetti(amount = 80) {
        const colors = ["#00c6ff", "#0072ff", "#f1c40f", "#2ecc71", "#9b59b6", "#ff9ff3", "#00d2d3"];
        for (let i = 0; i < amount; i += 1) {
            const confetti = document.createElement("div");
            confetti.className = "confetti";
            confetti.style.left = `${Math.random() * 100}vw`;
            confetti.style.top = `${-(Math.random() * 30 + 5)}vh`;
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            const size = Math.random() * 8 + 6;
            confetti.style.width = `${size}px`;
            confetti.style.height = `${size}px`;
            confetti.style.animationDuration = `${Math.random() * 2.5 + 2.8}s`;
            confetti.style.animationDelay = `${Math.random() * 0.35}s`;
            document.body.appendChild(confetti);
            setTimeout(() => confetti.remove(), 6500);
        }
    }

    window.ClassGameEffects = {
        shuffle,
        restartAnimation,
        shake,
        animateScore,
        fireConfetti
    };
})();
