// Mobile Menu Toggle
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', function() {
            navLinks.classList.toggle('active');
            
            // Animate hamburger to X
            const spans = this.querySelectorAll('span');
            this.classList.toggle('active');
            
            if (this.classList.contains('active')) {
                spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
                spans[1].style.opacity = '0';
                spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
            } else {
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            }
        });

        // Close menu when clicking a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                mobileMenuBtn.classList.remove('active');
                const spans = mobileMenuBtn.querySelectorAll('span');
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            });
        });
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const navbarHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = target.offsetTop - navbarHeight - 20;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Navbar background change on scroll
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 50) {
                navbar.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
            } else {
                navbar.style.boxShadow = 'none';
            }
        });
    }

    // Form submission handling (basic - replace with actual form handling)
    const contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(this);
            const data = Object.fromEntries(formData);
            
            // Here you would typically send the data to a server
            // For now, just show a success message
            console.log('Form submitted:', data);
            
            // Show success message (you can customize this)
            alert('Thank you for your message! We\'ll get back to you soon.');
            
            // Reset form
            this.reset();
        });
    }

    // Intersection Observer for animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);

    // Observe elements for animation
    document.querySelectorAll('.feature-card, .pricing-card, .testimonial-card, .step').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        observer.observe(el);
    });

    // Add animation class styles
    const style = document.createElement('style');
    style.textContent = `
        .animate-in {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);

    // ========================================
    // Application Modal
    // ========================================
    const modal = document.getElementById('apply-modal');
    const applyForm = document.getElementById('apply-form');
    const openModalBtns = document.querySelectorAll('.open-apply-modal');
    const closeModalBtns = document.querySelectorAll('.modal-close, .modal-close-btn');
    
    let currentStep = 1;
    const totalSteps = 3;

    // Open modal
    openModalBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (modal) {
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
                resetForm();
            }
        });
    });

    // Close modal
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal();
        });
    });

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Auto-open modal if ?apply=true in URL
    if (window.location.search.includes('apply=true') && modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        resetForm();
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function resetForm() {
        currentStep = 1;
        applyForm.reset();
        updateStepDisplay();
        
        // Reset file preview
        const filePreview = document.getElementById('file-preview');
        if (filePreview) {
            filePreview.classList.remove('has-file');
            filePreview.innerHTML = '';
        }
    }

    function updateStepDisplay() {
        // Update form steps
        document.querySelectorAll('.form-step').forEach(step => {
            step.classList.remove('active');
        });
        const activeStep = document.querySelector(`.form-step[data-step="${currentStep}"]`);
        if (activeStep) {
            activeStep.classList.add('active');
        }

        // Update progress indicators
        document.querySelectorAll('.progress-step').forEach(step => {
            const stepNum = parseInt(step.dataset.step);
            step.classList.remove('active', 'completed');
            
            if (stepNum === currentStep) {
                step.classList.add('active');
            } else if (stepNum < currentStep) {
                step.classList.add('completed');
            }
        });
    }

    // Next button handlers
    document.querySelectorAll('.btn-next').forEach(btn => {
        btn.addEventListener('click', () => {
            if (validateCurrentStep()) {
                currentStep++;
                updateStepDisplay();
            }
        });
    });

    // Previous button handlers
    document.querySelectorAll('.btn-prev').forEach(btn => {
        btn.addEventListener('click', () => {
            currentStep--;
            updateStepDisplay();
        });
    });

    // Form validation for current step
    function validateCurrentStep() {
        const currentStepEl = document.querySelector(`.form-step[data-step="${currentStep}"]`);
        const inputs = currentStepEl.querySelectorAll('input[required], select[required]');
        let isValid = true;

        inputs.forEach(input => {
            if (input.type === 'radio') {
                const radioGroup = currentStepEl.querySelectorAll(`input[name="${input.name}"]`);
                const isChecked = Array.from(radioGroup).some(r => r.checked);
                if (!isChecked) {
                    isValid = false;
                    // Highlight the radio group
                    radioGroup.forEach(r => {
                        r.closest('.deal-type-card')?.classList.add('error');
                    });
                }
            } else if (!input.value.trim()) {
                isValid = false;
                input.classList.add('error');
                input.style.borderColor = 'var(--color-error)';
            } else {
                input.classList.remove('error');
                input.style.borderColor = '';
            }
        });

        if (!isValid) {
            // Remove error styling after a moment
            setTimeout(() => {
                currentStepEl.querySelectorAll('.error').forEach(el => {
                    el.classList.remove('error');
                    el.style.borderColor = '';
                });
            }, 2000);
        }

        return isValid;
    }

    // File upload handling
    const fileInput = document.getElementById('agreement-file');
    const fileDropArea = document.getElementById('file-drop-area');
    const filePreview = document.getElementById('file-preview');

    if (fileInput && fileDropArea) {
        // Click to upload (but not if clicking the label/input directly)
        fileDropArea.addEventListener('click', (e) => {
            // Don't trigger if clicking the label or input (they handle it natively)
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL' || e.target.closest('label')) {
                return;
            }
            fileInput.click();
        });

        // Drag and drop
        fileDropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileDropArea.classList.add('dragover');
        });

        fileDropArea.addEventListener('dragleave', () => {
            fileDropArea.classList.remove('dragover');
        });

        fileDropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            fileDropArea.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                fileInput.files = files;
                showFilePreview(files[0]);
            }
        });

        // File input change
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                showFilePreview(fileInput.files[0]);
            }
        });
    }

    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

    function showFilePreview(file) {
        // Check file size
        if (file.size > MAX_FILE_SIZE) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            alert(`File is too large (${sizeMB}MB). Maximum size is 25MB.`);
            fileInput.value = '';
            return;
        }
        
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        filePreview.classList.add('has-file');
        filePreview.innerHTML = `
            <span class="file-preview-icon">📄</span>
            <span class="file-preview-name">${file.name} (${sizeMB}MB)</span>
            <button type="button" class="file-preview-remove" onclick="removeFile()">✕</button>
        `;
    }

    window.removeFile = function() {
        fileInput.value = '';
        filePreview.classList.remove('has-file');
        filePreview.innerHTML = '';
    };

    // Form submission
    if (applyForm) {
        applyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (validateCurrentStep()) {
                // Show loading state
                const submitBtn = applyForm.querySelector('button[type="submit"]');
                const originalText = submitBtn.textContent;
                submitBtn.textContent = 'Submitting...';
                submitBtn.disabled = true;
                
                try {
                    // Collect form data
                    const formData = new FormData();
                    formData.append('dealType', applyForm.querySelector('input[name="deal-type"]:checked')?.value || '');
                    formData.append('closingPrice', document.getElementById('closing-price')?.value || '');
                    formData.append('loanRequested', document.getElementById('loan-requested')?.value || '');
                    formData.append('city', document.getElementById('city')?.value || '');
                    formData.append('name', document.getElementById('apply-name')?.value || '');
                    formData.append('email', document.getElementById('apply-email')?.value || '');
                    formData.append('phone', document.getElementById('apply-phone')?.value || '');
                    
                    // Add file if present
                    const fileInput = document.getElementById('agreement-file');
                    if (fileInput && fileInput.files.length > 0) {
                        formData.append('agreement', fileInput.files[0]);
                    }
                    
                    // Submit to backend
                    const response = await fetch('https://ds-proforma-api.onrender.com/api/loan-application', {
                        method: 'POST',
                        body: formData
                    });
                    
                    const result = await response.json();
                    
                    if (response.ok) {
                        // Show success state
                        document.querySelectorAll('.form-step').forEach(step => {
                            step.classList.remove('active');
                        });
                        document.querySelector('.form-step[data-step="success"]').classList.add('active');
                        document.querySelector('.modal-progress').style.display = 'none';
                    } else {
                        alert('Error submitting application: ' + (result.error || 'Unknown error'));
                    }
                } catch (err) {
                    console.error('Submission error:', err);
                    alert('Error submitting application. Please try again.');
                } finally {
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                }
            }
        });
    }
});
