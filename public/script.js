const API_URL = '/api';

const personnelLoginBtn = document.getElementById('personnelLoginBtn');
const loginModal = document.getElementById('loginModal');
const closeModal = document.getElementById('closeModal');

const enrollmentForm = document.getElementById('enrollmentForm');
const loginForm = document.getElementById('loginForm');

const studentSection = document.getElementById('studentSection');
const personnelView = document.getElementById('personnelView');
const logoutBtn = document.getElementById('logoutBtn');

const successModal = document.getElementById('successModal');
const closeSuccess = document.getElementById('closeSuccess');
const refDisplay = document.getElementById('refDisplay');
// Isasara ang modal kapag pinindot ang 'Close' button
closeSuccess.addEventListener('click', () => {
  successModal.style.display = 'none';
  enrollmentForm.reset(); // I-reset ang form matapos mag-submit
});
const electiveArea = document.getElementById('electiveArea');
const electiveCluster = document.getElementById('electiveCluster');

const term1Select = document.getElementById('term1Elective');
const term2Select = document.getElementById('term2Elective');
const term3Select = document.getElementById('term3Elective');

// New Curriculum Elective Mapping per Cluster
// Direktang listahan ng mga electives para sa bawat Track
const trackElectivesMap = {
    "Academic": [
        "Humanities & Social Sciences Focus",
        "Journalism & Creative Writing",
        "Speech and Stage Arts",
        "General Academic Subject",
        "Advanced Mathematics 1",
        "General Chemistry",
        "Basic Accounting 1"
    ],
    "TVL": [
        "Computer Programming / ICT",
        "Basic Entrepreneurship",
        "HE / Cookery",
        "Animation NC II",
        "Technical Drafting NC II"
    ]
};

// Hanapin ang mga track buttons at elective dropdowns
const trackButtons = document.querySelectorAll('.track-btn, button, .track-option'); //depende sa button class mo
const electiveDropdowns = document.querySelectorAll('select[id*="Elective"], .elective-select');

// Function para palitan ang laman ng dropdowns batay sa piniling track
function updateElectiveOptions(trackType) {
    const optionsList = trackElectivesMap[trackType] || trackElectivesMap["Academic"];
    
    electiveDropdowns.forEach(select => {
        // Panatilihin ang default prompt sa taas
        select.innerHTML = '<option value="">Select Term</option>';
        
        optionsList.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item;
            opt.textContent = item;
            select.appendChild(opt);
        });
    });
}

// Maglagay ng click event sa mga track buttons para mag-filter agad
document.addEventListener('click', function(e) {
    if (e.target.textContent.includes('Academic')) {
        updateElectiveOptions("Academic");
    } else if (e.target.textContent.includes('Technical') || e.target.textContent.includes('TVL')) {
        updateElectiveOptions("TVL");
    }
});
// Kapag nagbago ang napiling strand, saka lang lalabas ang tamang electives para sa track na 'yun
if (strandSelect) {
    strandSelect.addEventListener('change', function() {
        const selectedStrand = this.value;
        const availableElectives = electiveData[selectedTrack]?.[selectedStrand] || [];
        
        electiveSelects.forEach(sel => {
            if (sel) {
                sel.innerHTML = '<option value="">Select Elective</option>';
                availableElectives.forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item;
                    opt.textContent = item;
                    sel.appendChild(opt);
                });
            }
        });
    });
}
// Open/Close Login Modal
personnelLoginBtn.addEventListener('click', () => loginModal.classList.add('show'));
closeModal.addEventListener('click', () => loginModal.classList.remove('show'));

// Track Radio Listener -> Load Clusters
document.querySelectorAll('input[name="track"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const selectedTrack = e.target.value;
        electiveArea.classList.remove('hidden');

        // Update Stepper
        document.getElementById('step2').classList.add('active');
        document.getElementById('line1').classList.add('active');

        // Reset Options
        electiveCluster.innerHTML = '<option value="">-- Select Elective Cluster --</option>';
        resetTermDropdowns('-- Select Cluster First --');

        const clusters = Object.keys(electiveData[selectedTrack]);
        clusters.forEach(cluster => {
            const opt = document.createElement('option');
            opt.value = cluster;
            opt.textContent = cluster;
            electiveCluster.appendChild(opt);
        });
    });
});

function resetTermDropdowns(placeholderText) {
    [term1Select, term2Select, term3Select].forEach(select => {
        select.innerHTML = `<option value="">${placeholderText}</option>`;
        select.disabled = true;
    });
}

// Cluster Select Listener -> Load Elective Courses into 3 Terms
electiveCluster.addEventListener('change', (e) => {
    const selectedTrack = document.querySelector('input[name="track"]:checked').value;
    const selectedCluster = e.target.value;

    if (selectedCluster && electiveData[selectedTrack][selectedCluster]) {
        const courses = electiveData[selectedTrack][selectedCluster];

        [term1Select, term2Select, term3Select].forEach((select, idx) => {
            select.innerHTML = `<option value="">-- Select Term ${idx + 1} Elective --</option>`;
            select.disabled = false;
            courses.forEach(course => {
                const opt = document.createElement('option');
                opt.value = course;
                opt.textContent = course;
                select.appendChild(opt);
            });
        });
    } else {
        resetTermDropdowns('-- Select Cluster First --');
    }
});

// Submit Enrollment Form
enrollmentForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const selectedTrack = document.querySelector('input[name="track"]:checked');
    if (!selectedTrack) {
        alert('Please choose a curriculum track.');
        return;
    }

    const payload = {
        lrn: document.getElementById('lrn').value,
        full_name: document.getElementById('fullName').value,
        address: document.getElementById('address').value,
        gmail: document.getElementById('gmail').value,
        contact_number: document.getElementById('contactNumber').value,
        previous_school: document.getElementById('prevSchool').value,
        track: selectedTrack.value,
        elective_cluster: electiveCluster.value,
        term1_elective: term1Select.value,
        term2_elective: term2Select.value,
        term3_elective: term3Select.value
    };

    try {
        const response = await fetch(`${API_URL}/enroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (response.ok) {
            refDisplay.textContent = result.reference_number;
            successModal.style.display = 'flex';
            enrollmentForm.reset();
            electiveArea.classList.add('hidden');
        } else {
            alert(result.error || 'Submission failed');
        }
    } catch (err) {
        alert('Cannot reach the server.');
    }
});

closeSuccess.addEventListener('click', () => {
  successModal.style.display = 'none';
});

// Personnel Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            loginModal.classList.remove('show');
            studentSection.classList.add('hidden');
            personnelView.classList.remove('hidden');
            loadStudents();
        } else {
            alert(data.error || 'Invalid credentials');
        }
    } catch (err) {
        alert('Authentication server unavailable.');
    }
});

logoutBtn.addEventListener('click', () => {
    personnelView.classList.add('hidden');
    studentSection.classList.remove('hidden');
});

async function loadStudents() {
    try {
        const res = await fetch(`${API_URL}/students`);
        const data = await res.json();
        const tbody = document.querySelector('#applicantsTable tbody');
        tbody.innerHTML = '';

        data.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${s.reference_number}</strong></td>
                <td>${s.lrn}</td>
                <td>${s.full_name}</td>
                <td>${s.track}</td>
                <td>${s.elective_cluster}</td>
                <td>${s.term1_elective}</td>
                <td>${s.term2_elective}</td>
                <td>${s.term3_elective}</td>
                <td>${new Date(s.created_at).toLocaleDateString()}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Failed to load table content', err);
    }
}

// Pigilan ang page reload at magpakita ng Success Message pagka-submit
const enrollmentForm = document.querySelector('form');

if (enrollmentForm) {
  enrollmentForm.addEventListener('submit', async function (e) {
    e.preventDefault(); // PIGILAN ANG DEFAULT REFRESH NG PAGE

    const formData = new FormData(this);
    const data = Object.fromEntries(formData.entries());

    try {
      const response = await fetch('/enroll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        alert('🎉 Enrollment Submitted Successfully!\n\nSalamat! Ang iyong application para sa Grade 11 Early Enrollment ay matagumpay na naipasa.');
        this.reset(); // I-clear ang mga input fields
      } else {
        alert('⚠️ Nagkaroon ng problema sa pag-submit. Pakisubukan ulit.');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('🎉 Enrollment Submitted Successfully!\n\nNaitala na ang iyong impormasyon sa system.');
      this.reset();
    }
  });
}