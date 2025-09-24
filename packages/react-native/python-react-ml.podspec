require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "python-react-ml"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.description  = <<-DESC
                  Python React ML enables running Python ML models directly in React Native apps.
                   DESC
  s.homepage     = "https://github.com/yourusername/python-react-ml"
  s.license      = "MIT"
  s.authors      = { "Your Name" => "your.email@example.com" }
  s.platforms    = { :ios => "11.0" }
  s.source       = { :git => "https://github.com/yourusername/python-react-ml.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,c,cc,cpp,m,mm,swift}"
  s.requires_arc = true

  s.dependency "React-Core"

  # Install or update CocoaPods dependencies
  # s.dependency "Python-iOS"  # Hypothetical Python runtime for iOS
end